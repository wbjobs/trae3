import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface AppState {
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  loading: boolean
  breadcrumbs: string[]
}

const initialState: AppState = {
  theme: 'light',
  sidebarCollapsed: false,
  loading: false,
  breadcrumbs: []
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    setBreadcrumbs: (state, action: PayloadAction<string[]>) => {
      state.breadcrumbs = action.payload
    }
  }
})

export const { setTheme, toggleSidebar, setLoading, setBreadcrumbs } = appSlice.actions
export default appSlice.reducer
