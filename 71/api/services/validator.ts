import type { ConfigParams } from '../../shared/types.js'

interface ValidationResult {
  valid: boolean
  errors: string[]
}

function isInvalidNumber(val: unknown): boolean {
  return typeof val !== 'number' || isNaN(val) || !isFinite(val)
}

function validateConfigParams(params: ConfigParams): ValidationResult {
  const errors: string[] = []

  if (isInvalidNumber(params.ratedPower)) {
    errors.push('ratedPower 必须是有效数字')
  } else if (params.ratedPower < 1 || params.ratedPower > 500) {
    errors.push('ratedPower 必须在 1-500 kW 之间')
  }

  if (isInvalidNumber(params.acVoltageMax)) {
    errors.push('acVoltageMax 必须是有效数字')
  } else if (params.acVoltageMax < 200 || params.acVoltageMax > 300) {
    errors.push('acVoltageMax 必须在 200-300 V 之间')
  }

  if (isInvalidNumber(params.acVoltageMin)) {
    errors.push('acVoltageMin 必须是有效数字')
  } else if (params.acVoltageMin < 100 || params.acVoltageMin > 250) {
    errors.push('acVoltageMin 必须在 100-250 V 之间')
  }

  if (!isInvalidNumber(params.acVoltageMax) && !isInvalidNumber(params.acVoltageMin)) {
    if (params.acVoltageMax <= params.acVoltageMin) {
      errors.push('acVoltageMax 必须大于 acVoltageMin')
    }
    if (params.acVoltageMax - params.acVoltageMin < 20) {
      errors.push('acVoltageMax 与 acVoltageMin 差值必须至少 20V')
    }
  }

  if (isInvalidNumber(params.overVoltageThreshold)) {
    errors.push('overVoltageThreshold 必须是有效数字')
  } else if (params.overVoltageThreshold < 200 || params.overVoltageThreshold > 300) {
    errors.push('overVoltageThreshold 必须在 200-300 V 之间')
  }

  if (isInvalidNumber(params.underVoltageThreshold)) {
    errors.push('underVoltageThreshold 必须是有效数字')
  } else if (params.underVoltageThreshold < 100 || params.underVoltageThreshold > 250) {
    errors.push('underVoltageThreshold 必须在 100-250 V 之间')
  }

  if (!isInvalidNumber(params.overVoltageThreshold) && !isInvalidNumber(params.underVoltageThreshold)) {
    if (params.overVoltageThreshold <= params.underVoltageThreshold) {
      errors.push('overVoltageThreshold 必须大于 underVoltageThreshold')
    }
  }

  if (!isInvalidNumber(params.acVoltageMax) && !isInvalidNumber(params.overVoltageThreshold)) {
    if (params.overVoltageThreshold > params.acVoltageMax) {
      errors.push('overVoltageThreshold 不能超过 acVoltageMax')
    }
  }

  if (!isInvalidNumber(params.acVoltageMin) && !isInvalidNumber(params.underVoltageThreshold)) {
    if (params.underVoltageThreshold < params.acVoltageMin) {
      errors.push('underVoltageThreshold 不能低于 acVoltageMin')
    }
  }

  if (isInvalidNumber(params.overFreqThreshold)) {
    errors.push('overFreqThreshold 必须是有效数字')
  } else if (params.overFreqThreshold < 50 || params.overFreqThreshold > 60) {
    errors.push('overFreqThreshold 必须在 50-60 Hz 之间')
  }

  if (isInvalidNumber(params.underFreqThreshold)) {
    errors.push('underFreqThreshold 必须是有效数字')
  } else if (params.underFreqThreshold < 45 || params.underFreqThreshold > 55) {
    errors.push('underFreqThreshold 必须在 45-55 Hz 之间')
  }

  if (!isInvalidNumber(params.overFreqThreshold) && !isInvalidNumber(params.underFreqThreshold)) {
    if (params.overFreqThreshold <= params.underFreqThreshold) {
      errors.push('overFreqThreshold 必须大于 underFreqThreshold')
    }
    if (params.overFreqThreshold - params.underFreqThreshold < 1) {
      errors.push('overFreqThreshold 与 underFreqThreshold 差值必须至少 1Hz')
    }
  }

  if (isInvalidNumber(params.overTempThreshold)) {
    errors.push('overTempThreshold 必须是有效数字')
  } else if (params.overTempThreshold < 50 || params.overTempThreshold > 100) {
    errors.push('overTempThreshold 必须在 50-100 °C 之间')
  }

  if (isInvalidNumber(params.heartbeatInterval)) {
    errors.push('heartbeatInterval 必须是有效数字')
  } else if (params.heartbeatInterval < 5 || params.heartbeatInterval > 300) {
    errors.push('heartbeatInterval 必须在 5-300 s 之间')
  }

  if (isInvalidNumber(params.reportInterval)) {
    errors.push('reportInterval 必须是有效数字')
  } else if (params.reportInterval < 1 || params.reportInterval > 60) {
    errors.push('reportInterval 必须在 1-60 s 之间')
  }

  if (!isInvalidNumber(params.heartbeatInterval) && !isInvalidNumber(params.reportInterval)) {
    if (params.heartbeatInterval < params.reportInterval) {
      errors.push('heartbeatInterval 必须大于等于 reportInterval')
    }
  }

  return { valid: errors.length === 0, errors }
}

export { validateConfigParams }
