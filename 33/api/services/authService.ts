import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import * as userRepo from '../repositories/userRepository.js'
import * as labRepo from '../repositories/labRepository.js'

const JWT_SECRET = 'sample-tracker-secret-key-2024'
const JWT_EXPIRES_IN = '24h'

export function login(username: string, password: string): { token: string; user: any } | null {
  const user = userRepo.findByUsername(username)
  if (!user) return null

  const valid = bcrypt.compareSync(password, user.password)
  if (!valid) return null

  const payload = { id: user.id, username: user.username, role: user.role, labId: user.lab_id }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

  let labName: string | null = null
  if (user.lab_id) {
    const lab = labRepo.findById(user.lab_id)
    labName = lab ? lab.name : null
  }

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      lab_id: user.lab_id,
      lab_name: labName,
    }
  }
}
