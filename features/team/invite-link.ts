/** The link an invitee opens to sign up. The raw token exists only right after create or resend. */
export function inviteUrl(token: string) {
  return `${window.location.origin}/?invite=${token}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
