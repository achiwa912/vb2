import { ref, onMounted, onUnmounted } from 'vue'

export function useKeyboardShortcuts<A extends string>(
  resolveAction: (event: KeyboardEvent) => A | null,
  handlers: Partial<Record<A, () => void>>,
  options?: { isModalOpen?: () => boolean, }
) {
  const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
  const SCROLL_KEYS = new Set([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

  const TIMEOUT_MS = 10_000
  const helpOpen = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  
  function isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return target.isContentEditable || EDITABLE_TAGS.has(target.tagName)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.repeat) return

    if (helpOpen.value) {
      hideHelp()
      if (e.key === 'Escape') return
    }
  
    if (options?.isModalOpen?.()) return
    // do I want to check navbar menu open here???

    const action = resolveAction(e)
    if (!action) return

    if (action !== 'escape' && isEditable(e.target)) return
    if (SCROLL_KEYS.has(e.key)) e.preventDefault()  
  
    handlers[action]?.()
  }

  function clearTimer() {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined }
  }

  function showHelp() {
    helpOpen.value = true
    clearTimer()
    timer = setTimeout(() => { helpOpen.value = false; timer = undefined }, TIMEOUT_MS)
  }

  function hideHelp() {
    helpOpen.value = false
    clearTimer()
  }

  function dismissHelpOnPointerDown() {
    if (helpOpen.value) hideHelp()
  }


  onMounted(() => {
    window.addEventListener("pointerdown", dismissHelpOnPointerDown)
    window.addEventListener("keydown", handleKeyDown)
  })

  onUnmounted(() => {
    clearTimer()
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("pointerdown", dismissHelpOnPointerDown)
  })
  
  return { helpOpen, showHelp, hideHelp  }
}
