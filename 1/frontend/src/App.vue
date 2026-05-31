<script setup lang="ts">
import { onMounted } from 'vue'
import { useUserStore } from '@/store/user'
import { useAppStore } from '@/store/app'

const userStore = useUserStore()
const appStore = useAppStore()

onMounted(() => {
  userStore.initFromStorage()
  appStore.initFromStorage()
})
</script>

<template>
  <div class="app-container min-h-screen bg-dark-bg text-dark-text">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.app-container {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

* {
  scrollbar-width: thin;
  scrollbar-color: #374151 #1F2937;
}

*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

*::-webkit-scrollbar-track {
  background: #1F2937;
  border-radius: 4px;
}

*::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 4px;
}

*::-webkit-scrollbar-thumb:hover {
  background: #4B5563;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.dark-table .el-table__body tr:hover > td.el-table__cell {
  background-color: rgba(59, 130, 246, 0.1) !important;
}

.dark-table .el-table__row {
  background-color: #111827 !important;
}

.dark-table .el-table__body tr.current-row > td.el-table__cell {
  background-color: rgba(59, 130, 246, 0.15) !important;
}

.el-dialog {
  --el-dialog-bg-color: #1F2937;
  --el-dialog-title-color: #F3F4F6;
  --el-dialog-border-color: #374151;
}

.el-dialog__body {
  color: #E5E7EB;
}

.el-input__wrapper {
  background-color: #111827 !important;
  box-shadow: 0 0 0 1px #374151 inset !important;
}

.el-input__wrapper:hover {
  box-shadow: 0 0 0 1px #60A5FA inset !important;
}

.el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1px #00D4FF inset !important;
}

.el-input__inner {
  color: #E5E7EB !important;
}

.el-input__inner::placeholder {
  color: #6B7280 !important;
}

.el-select__wrapper {
  background-color: #111827 !important;
  box-shadow: 0 0 0 1px #374151 inset !important;
}

.el-select__wrapper:hover {
  box-shadow: 0 0 0 1px #60A5FA inset !important;
}

.el-select__wrapper.is-focused {
  box-shadow: 0 0 0 1px #00D4FF inset !important;
}

.el-select-dropdown {
  background-color: #1F2937 !important;
  border: 1px solid #374151 !important;
}

.el-select-dropdown__item {
  color: #E5E7EB !important;
}

.el-select-dropdown__item:hover {
  background-color: #374151 !important;
}

.el-select-dropdown__item.selected {
  color: #00D4FF !important;
  font-weight: 500;
}

.el-pagination {
  --el-pagination-hover-color: #00D4FF;
  --el-pagination-color: #E5E7EB;
  --el-pagination-bg-color: #1F2937;
  --el-pagination-border-color: #374151;
  --el-pagination-button-bg-color: #111827;
  --el-pagination-button-disabled-color: #6B7280;
  --el-pagination-button-disabled-bg-color: #1F2937;
}

.el-pagination.is-background .el-pager li:not(.is-active):hover {
  color: #00D4FF !important;
}

.el-pagination.is-background .el-pager li.is-active {
  background-color: #00D4FF !important;
  color: #000 !important;
}

.el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: #00D4FF !important;
  border-color: #00D4FF !important;
}

.el-switch.is-checked .el-switch__core {
  background-color: #00D4FF !important;
  border-color: #00D4FF !important;
}

.el-message-box {
  background-color: #1F2937 !important;
  border: 1px solid #374151 !important;
}

.el-message-box__title {
  color: #F3F4F6 !important;
}

.el-message-box__message {
  color: #E5E7EB !important;
}

.el-message {
  background-color: #1F2937 !important;
  border: 1px solid #374151 !important;
  color: #E5E7EB !important;
}

.el-message--success {
  border-color: #10B981 !important;
}

.el-message--warning {
  border-color: #F59E0B !important;
}

.el-message--error {
  border-color: #EF4444 !important;
}

.el-message--info {
  border-color: #3B82F6 !important;
}

.el-form-item__label {
  color: #9CA3AF !important;
}

.el-tag {
  border: none !important;
}

.el-skeleton__item {
  background-color: #374151 !important;
}

.el-skeleton__item.is-animated {
  background-image: linear-gradient(
    90deg,
    #374151 25%,
    #4B5563 50%,
    #374151 75%
  ) !important;
}
</style>
