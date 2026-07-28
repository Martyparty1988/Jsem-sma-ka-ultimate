/*
 * Compatibility no-op.
 * The former full-screen biometric terminal was removed from the product flow.
 */
export async function animateTerminalReadout() {
  return { skipped: true, cancelled: false };
}

export default animateTerminalReadout;
