import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { User, Tenant } from '@/types'
import { storage } from '@/utils'

interface UserState {
  token: string | null
  user: User | null
  tenant: Tenant | null
  tenants: Tenant[]
  permissions: string[]
}

const initialState: UserState = {
  token: storage.getToken(),
  user: storage.getUser(),
  tenant: null,
  tenants: [],
  permissions: []
}

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload
      storage.setToken(action.payload)
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload
      storage.setUser(action.payload)
    },
    setTenant: (state, action: PayloadAction<Tenant>) => {
      state.tenant = action.payload
      storage.setTenant(action.payload.id)
    },
    setTenants: (state, action: PayloadAction<Tenant[]>) => {
      state.tenants = action.payload
    },
    setPermissions: (state, action: PayloadAction<string[]>) => {
      state.permissions = action.payload
    },
    logout: (state) => {
      state.token = null
      state.user = null
      state.tenant = null
      state.permissions = []
      storage.clear()
    }
  }
})

export const { setToken, setUser, setTenant, setTenants, setPermissions, logout } = userSlice.actions
export default userSlice.reducer
