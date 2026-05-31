import { Injectable } from '@nestjs/common';
import { SensitiveMatch } from './strategies/desensitizer.interface';
import { RegexStrategy } from './strategies/regex.strategy';
import { NlpStrategy } from './strategies/nlp.strategy';
import { CreateDesensitizeDto, DesensitizeMode } from './dto/desensitize.dto';

export interface DesensitizeResult {
  originalText: string;
  desensitizedText: string;
  matches: SensitiveMatch[];
  statistics: Record<string, number>;
}

export interface DesensitizeHistoryEntry {
  fileId: string;
  timestamp: Date;
  mode: DesensitizeMode;
  matchesCount: number;
  statistics: Record<string, number>;
}

@Injectable()
export class DesensitizationService {
  private readonly history: Map<string, DesensitizeHistoryEntry[]> = new Map();

  constructor(
    private readonly regexStrategy: RegexStrategy,
    private readonly nlpStrategy: NlpStrategy,
  ) {}

  async processText(text: string, dto: CreateDesensitizeDto): Promise<DesensitizeResult> {
    const { rules, mode } = dto;
    const activeMode = mode ?? DesensitizeMode.MASK;

    const allMatches = await this.detectAll(text, rules);
    const nonOverlapping = this.removeOverlaps(allMatches);
    const adjustedMatches = this.applyMode(nonOverlapping, activeMode);
    const desensitizedText = this.buildDesensitizedText(text, adjustedMatches);
    const statistics = this.buildStatistics(adjustedMatches);

    return {
      originalText: text,
      desensitizedText,
      matches: adjustedMatches,
      statistics,
    };
  }

  async processTextForFile(fileId: string, text: string, dto: CreateDesensitizeDto): Promise<DesensitizeResult> {
    const result = await this.processText(text, dto);

    const entry: DesensitizeHistoryEntry = {
      fileId,
      timestamp: new Date(),
      mode: dto.mode ?? DesensitizeMode.MASK,
      matchesCount: result.matches.length,
      statistics: result.statistics,
    };

    const existing = this.history.get(fileId) ?? [];
    existing.push(entry);
    this.history.set(fileId, existing);

    return result;
  }

  getAllRuleTypes(): string[] {
    return [
      ...this.regexStrategy.getRuleTypes(),
      ...this.nlpStrategy.getRuleTypes(),
    ];
  }

  getHistory(fileId: string): DesensitizeHistoryEntry[] {
    return this.history.get(fileId) ?? [];
  }

  private async detectAll(text: string, rules?: string[]): Promise<SensitiveMatch[]> {
    const regexMatches = await this.regexStrategy.detect(text);
    const nlpMatches = await this.nlpStrategy.detect(text);

    let allMatches = [...regexMatches, ...nlpMatches];

    if (rules && rules.length > 0) {
      const ruleSet = new Set(rules);
      allMatches = allMatches.filter((m) => ruleSet.has(m.type));
    }

    return allMatches;
  }

  private removeOverlaps(matches: SensitiveMatch[]): SensitiveMatch[] {
    const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
    const result: SensitiveMatch[] = [];

    for (const match of sorted) {
      if (result.length === 0) {
        result.push(match);
        continue;
      }

      const last = result[result.length - 1];
      if (match.start >= last.end) {
        result.push(match);
      }
    }

    return result;
  }

  private applyMode(matches: SensitiveMatch[], mode: DesensitizeMode): SensitiveMatch[] {
    return matches.map((m) => {
      let replacement: string;

      switch (mode) {
        case DesensitizeMode.REPLACE:
          replacement = `[${m.type.toUpperCase()}]`;
          break;
        case DesensitizeMode.REMOVE:
          replacement = '';
          break;
        case DesensitizeMode.MASK:
        default:
          replacement = m.replacement;
          break;
      }

      return { ...m, replacement };
    });
  }

  private buildDesensitizedText(text: string, matches: SensitiveMatch[]): string {
    const sorted = [...matches].sort((a, b) => a.start - b.start);
    let result = '';
    let lastEnd = 0;

    for (const match of sorted) {
      result += text.slice(lastEnd, match.start);
      result += match.replacement;
      lastEnd = match.end;
    }

    result += text.slice(lastEnd);
    return result;
  }

  private buildStatistics(matches: SensitiveMatch[]): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const match of matches) {
      stats[match.type] = (stats[match.type] ?? 0) + 1;
    }
    return stats;
  }
}
