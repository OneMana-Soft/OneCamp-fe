import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface RecentItem {
  id: string
  type: "task" | "channel" | "doc" | "project" | "team" | "chat" | "user"
  title: string
  path: string
  timestamp: number
}

interface RecentItemsState {
  items: RecentItem[]
}

const MAX_RECENT = 10

const initialState: RecentItemsState = {
  items: []
}

export const recentItemsSlice = createSlice({
  name: "recentItems",
  initialState,
  reducers: {
    addRecentItem: (state, action: PayloadAction<Omit<RecentItem, "timestamp">>) => {
      const item = action.payload
      // Remove existing entry with same id+type
      state.items = state.items.filter(
        (r) => !(r.id === item.id && r.type === item.type)
      )
      // Add new entry at front
      state.items.unshift({ ...item, timestamp: Date.now() })
      // Trim to max
      if (state.items.length > MAX_RECENT) {
        state.items = state.items.slice(0, MAX_RECENT)
      }
    },
    clearRecentItems: (state) => {
      state.items = []
    }
  }
})

export const { addRecentItem, clearRecentItems } = recentItemsSlice.actions
export default recentItemsSlice.reducer
