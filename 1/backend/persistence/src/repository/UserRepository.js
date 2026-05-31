import BaseRepository from './BaseRepository.js'
import { User } from '../models/index.js'

class UserRepository extends BaseRepository {
  constructor() {
    super(User)
  }

  async findByUsername(username) {
    return this.findOne({ username })
  }

  async findByRole(role) {
    return this.findAll({ role })
  }

  async findActiveUsers() {
    return this.findAll({ status: 'active' })
  }

  async updateStatus(id, status) {
    return this.update(id, { status })
  }
}

export default new UserRepository()
