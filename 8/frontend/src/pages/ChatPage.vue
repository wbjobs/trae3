<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getConversationsApi, getConversationMessagesApi, deleteConversationApi, getChatStreamUrl, getAuthHeaders } from '@/utils/api'
import { Send, Plus, MessageSquare, Trash2, BookOpen, ExternalLink } from 'lucide-vue-next'

const router = useRouter()

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources: any[]
  created_at: string
}

const conversations = ref<any[]>([])
const currentConvId = ref<string | null>(null)
const messages = ref<DisplayMessage[]>([])
const input = ref('')
const sending = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)

const currentConv = computed(() =>
  conversations.value.find(c => c.id === currentConvId.value)
)

async function fetchConversations() {
  try {
    conversations.value = await getConversationsApi()
  } catch (e) {
    console.error(e)
  }
}

async function selectConversation(id: string) {
  currentConvId.value = id
  try {
    const msgs = await getConversationMessagesApi(id)
    messages.value = msgs.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      sources: m.sources || [],
      created_at: m.created_at,
    }))
    scrollToBottom()
  } catch (e) {
    console.error(e)
  }
}

function newConversation() {
  currentConvId.value = null
  messages.value = []
}

async function handleDeleteConv(id: string, e: Event) {
  e.stopPropagation()
  if (!confirm('删除此对话？')) return
  try {
    await deleteConversationApi(id)
    if (currentConvId.value === id) {
      newConversation()
    }
    fetchConversations()
  } catch (e) {
    console.error(e)
  }
}

function goToDocument(docId: string) {
  router.push({ path: '/documents', query: { highlight: docId } })
}

async function sendMessage() {
  if (!input.value.trim() || sending.value) return
  const question = input.value.trim()
  input.value = ''
  messages.value.push({
    id: Date.now().toString(),
    role: 'user',
    content: question,
    sources: [],
    created_at: new Date().toISOString(),
  })
  sending.value = true

  const assistantMsg: DisplayMessage = {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content: '',
    sources: [],
    created_at: new Date().toISOString(),
  }
  messages.value.push(assistantMsg)
  scrollToBottom()

  try {
    const res = await fetch(getChatStreamUrl(), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        question,
        conversation_id: currentConvId.value || undefined,
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`Request failed: ${res.status} ${errorBody}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No reader available')
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim()
          if (!dataStr || dataStr === '[DONE]') continue
          try {
            const data = JSON.parse(dataStr)
            if (data.type === 'chunk' && data.content) {
              assistantMsg.content += data.content
              scrollToBottom()
            } else if (data.type === 'done') {
              currentConvId.value = data.conversation_id
              assistantMsg.sources = data.sources || []
              fetchConversations()
            } else if (data.type === 'error') {
              assistantMsg.content += `\n\n[错误: ${data.content}]`
            }
          } catch (parseErr) {
            console.warn('SSE parse error:', parseErr, 'line:', trimmed)
          }
        }
      }
    }
  } catch (e: any) {
    assistantMsg.content = `请求失败: ${e.message}`
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

onMounted(fetchConversations)
</script>

<template>
  <div class="flex h-[calc(100vh-8rem)] gap-4">
    <div class="w-64 flex flex-col bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden shrink-0">
      <div class="p-3 border-b border-slate-700/50">
        <button @click="newConversation" class="btn-primary w-full flex items-center justify-center gap-2">
          <Plus class="w-4 h-4" />
          新对话
        </button>
      </div>
      <div class="flex-1 overflow-auto p-2 space-y-1">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          @click="selectConversation(conv.id)"
          :class="[
            'group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200',
            currentConvId === conv.id
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
          ]"
        >
          <MessageSquare class="w-4 h-4 shrink-0" />
          <span class="text-sm truncate flex-1">{{ conv.title }}</span>
          <button
            @click="handleDeleteConv(conv.id, $event)"
            class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 flex flex-col bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
      <div ref="messagesContainer" class="flex-1 overflow-auto p-6 space-y-4">
        <div v-if="messages.length === 0" class="flex flex-col items-center justify-center h-full text-slate-500">
          <BookOpen class="w-16 h-16 mb-4 text-slate-600" />
          <p class="text-lg font-medium mb-1">智能文档问答</p>
          <p class="text-sm">输入问题，AI 将基于文档库内容回答</p>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']"
        >
          <div
            :class="[
              'max-w-[80%] rounded-2xl px-4 py-3',
              msg.role === 'user'
                ? 'bg-blue-500/20 text-blue-100 border border-blue-500/20'
                : 'bg-slate-800 text-slate-200 border border-slate-700/50',
            ]"
          >
            <p class="text-sm leading-relaxed whitespace-pre-wrap">{{ msg.content }}</p>
            <div v-if="msg.sources && msg.sources.length > 0" class="mt-3 pt-3 border-t border-slate-700/30 space-y-2">
              <p class="text-xs text-slate-500 font-medium">引用来源:</p>
              <div
                v-for="(source, idx) in msg.sources"
                :key="idx"
                class="p-2.5 bg-slate-700/30 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors group/source"
                @click="goToDocument(source.document_id)"
              >
                <div class="flex items-center gap-2 mb-1">
                  <BookOpen class="w-3 h-3 text-blue-400 shrink-0" />
                  <span class="text-xs text-blue-400 group-hover/source:text-blue-300 transition-colors">{{ source.filename }}</span>
                  <span v-if="source.page_number" class="badge-info text-[10px]">第{{ source.page_number }}页</span>
                  <span class="text-xs text-slate-500">{{ (source.score * 100).toFixed(1) }}%</span>
                  <ExternalLink class="w-3 h-3 text-slate-500 group-hover/source:text-blue-400 ml-auto transition-colors" />
                </div>
                <p class="text-xs text-slate-400 line-clamp-2">{{ source.content }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="p-4 border-t border-slate-700/50">
        <div class="flex items-center gap-3">
          <input
            v-model="input"
            placeholder="输入你的问题..."
            class="input-field flex-1"
            @keyup.enter="sendMessage"
            :disabled="sending"
          />
          <button
            @click="sendMessage"
            :disabled="sending || !input.trim()"
            class="btn-primary px-3 py-2.5 disabled:opacity-50"
          >
            <Send class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
