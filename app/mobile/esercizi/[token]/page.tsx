// Redirect mobile users to the public exercise page
// The middleware redirects /esercizi/[token] to /mobile/esercizi/[token] on iPhone
// So we just re-export the same page

export { default } from "@/app/esercizi/[token]/page";
