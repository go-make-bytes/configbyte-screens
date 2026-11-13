<script setup lang="ts">
// The door of the deployment's own area. Before the area's first call, a sign-in that the
// browser's clock says is older than the deployment asks for (or one whose time is not
// known) shows the page that says to sign in again, and nothing of the area is asked. The
// clock is only a first guess, and the server's answer decides:
//  - it is made once for a sign-in time, and never again once the server has accepted a call for it;
//  - it is never made twice in a row: a person who has just come back from a sign-in that
//    asked for a recent one is not judged again, so a clock that runs ahead cannot loop;
//  - it is never made for a person who is not shown the area, who is asked nothing but the
//    area's own call, so its refusal is what they read.
// It is settled once, as the area is entered: a page already open is never swapped for it,
// so what a person typed stays.
import { onMounted } from 'vue'

import { isRecent } from '../../lib/again'
import { useAdminSession } from '../../stores/session'
import SignInAgainPage from './SignInAgainPage.vue'

const session = useAdminSession()
// The clock guesses at most once for a sign-in time: once the server has accepted a call of the area for it, only
// the server's own refusal brings the sign-in page back.
const accepted = session.areaAcceptedFor !== null && session.areaAcceptedFor === (session.me?.signedInAt ?? '')
const stale = session.managesDeployment && !session.cameBack && !accepted && !isRecent(session.me?.signedInAt, session.deployment?.signInAge)

// Having come back counts for the first entry only.
onMounted(() => {
  session.cameBack = false
})
</script>

<template>
  <SignInAgainPage v-if="stale" />
  <slot v-else />
</template>
