// Shared by the root layout (server) and the explainer (client). Kept out of the "use client"
// module so the layout gets the real string, not a client reference.
export const DHR_INTRO_KEY = "d1h-dhr-intro";
/** Inline script for <head>: marks the home explainer as dismissed before first paint. */
export const DHR_INTRO_SCRIPT = `try{if(localStorage.getItem("${DHR_INTRO_KEY}")==="1")document.documentElement.dataset.dhrIntro="off"}catch(e){}`;
