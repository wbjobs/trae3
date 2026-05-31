import mongoose from 'mongoose'

let isConnected = false

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thermal_detect'
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 })
    isConnected = true
    console.log('MongoDB connected:', uri)
  } catch (error) {
    console.warn('MongoDB connection failed, running in mock mode')
    isConnected = false
  }
}

export function isDBConnected(): boolean {
  return isConnected
}
