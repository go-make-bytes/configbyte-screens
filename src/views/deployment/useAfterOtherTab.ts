// A page of the deployment's area that opened a sign-in tab learns it is done. The
// sign-in is shared by every tab of this browser, so the page reads who is signed in
// again when it is looked at again, and when the sign-in tab tells the browser's tabs
// that it signed in. It trusts only the answer it reads itself.
import { onBeforeUnmount, onMounted } from 'vue'

import { SIGN_IN_CHANNEL } from '../../lib/again'
import { useDeployment } from '../../stores/deployment'

export function useAfterOtherTab() {
  const deployment = useDeployment()
  let channel: BroadcastChannel | null = null

  const look = () => void deployment.afterOtherTab()
  const seen = () => {
    if (document.visibilityState === 'visible') look()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', seen)
    window.addEventListener('focus', look)
    try {
      channel = new BroadcastChannel(SIGN_IN_CHANNEL)
      channel.onmessage = look
    } catch {
      // Without it the page is told when it is looked at again.
      channel = null
    }
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', seen)
    window.removeEventListener('focus', look)
    channel?.close()
  })
}
