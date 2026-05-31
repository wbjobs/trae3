import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const preprocessedDir = path.resolve(__dirname, '..', '..', 'uploads', '.preprocessed')

if (!fs.existsSync(preprocessedDir)) {
  fs.mkdirSync(preprocessedDir, { recursive: true })
}

export async function preprocessImage(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.pdf') {
    return filePath
  }

  const basename = path.basename(filePath, ext)
  const outputPath = path.join(preprocessedDir, `${basename}_processed.png`)

  if (fs.existsSync(outputPath)) {
    return outputPath
  }

  const metadata = await sharp(filePath).metadata()
  const width = metadata.width || 1000

  const targetWidth = Math.min(width, 2000)

  const pipeline = sharp(filePath)
    .resize(targetWidth, null, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .grayscale()
    .normalize()
    .linear(1.5, -128)
    .threshold(128, { grayscale: false })
    .sharpen({
      sigma: 1,
      m1: 0.5,
      m2: 0.3,
    })
    .png({ compressionLevel: 1, palette: false })

  await pipeline.toFile(outputPath)

  return outputPath
}

export function cleanupPreprocessed(filePath: string): void {
  try {
    if (fs.existsSync(filePath) && filePath.includes('.preprocessed')) {
      fs.unlinkSync(filePath)
    }
  } catch {
    // ignore cleanup errors
  }
}
