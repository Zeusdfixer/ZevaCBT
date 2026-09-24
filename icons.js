/**
 * ICONS — inline SVG icon library for Zeva CBT.
 * Replaces emoji/unicode symbols everywhere for consistent, crisp rendering
 * across every device and OS (emoji render differently per platform; these don't).
 * Each function returns an SVG markup string with a `zeva-icon` class for sizing.
 * Pass a class string to add context-specific sizing/color via CSS.
 */

const ZevaIcons = {
  school: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3L2 8L12 13L22 8L12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M6 10.5V16C6 16 8.5 18 12 18C15.5 18 18 16 18 16V10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 8V15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,

  graduationCap: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 9L12 4L22 9L12 14L2 9Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M6 11.5V16.5C6 16.5 8.5 19 12 19C15.5 19 18 16.5 18 16.5V11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 9V15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,

  briefcase: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="7.5" width="18" height="12" rx="1.6" stroke="currentColor" stroke-width="1.6"/>
    <path d="M8 7.5V5.8C8 4.8 8.8 4 9.8 4H14.2C15.2 4 16 4.8 16 5.8V7.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M3 12.5H21" stroke="currentColor" stroke-width="1.6"/>
    <path d="M10.5 12.5V14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  speaker: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 9.5V14.5H7.5L12.5 18.5V5.5L7.5 9.5H4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M16.5 8.5C17.5 9.5 18 10.7 18 12C18 13.3 17.5 14.5 16.5 15.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M19 6C20.6 7.6 21.5 9.7 21.5 12C21.5 14.3 20.6 16.4 19 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,

  speakerMuted: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 9.5V14.5H7.5L12.5 18.5V5.5L7.5 9.5H4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M16 9.5L20 13.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M20 9.5L16 13.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,

  calculator: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="3" width="14" height="18" rx="1.8" stroke="currentColor" stroke-width="1.6"/>
    <rect x="7.5" y="5.5" width="9" height="4" rx="0.6" stroke="currentColor" stroke-width="1.4"/>
    <circle cx="8.3" cy="13" r="0.9" fill="currentColor"/>
    <circle cx="12" cy="13" r="0.9" fill="currentColor"/>
    <circle cx="15.7" cy="13" r="0.9" fill="currentColor"/>
    <circle cx="8.3" cy="16.3" r="0.9" fill="currentColor"/>
    <circle cx="12" cy="16.3" r="0.9" fill="currentColor"/>
    <circle cx="15.7" cy="16.3" r="0.9" fill="currentColor"/>
  </svg>`,

  logout: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 8V6C15 4.9 14.1 4 13 4H7C5.9 4 5 4.9 5 6V18C5 19.1 5.9 20 7 20H13C14.1 20 15 19.1 15 18V16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 12H21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M18 9L21 12L18 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  pause: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>
  </svg>`,

  starFilled: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3.5L14.6 9.2L20.8 9.9L16.2 14.1L17.5 20.3L12 17.1L6.5 20.3L7.8 14.1L3.2 9.9L9.4 9.2L12 3.5Z"/>
  </svg>`,

  starOutline: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3.5L14.6 9.2L20.8 9.9L16.2 14.1L17.5 20.3L12 17.1L6.5 20.3L7.8 14.1L3.2 9.9L9.4 9.2L12 3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`,

  checkCircle: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
    <path d="M8 12.3L10.6 14.9L16 9.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  crossCircle: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
    <path d="M9 9L15 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M15 9L9 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`,

  chatBubble: (cls = '') => `<svg class="zeva-icon ${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 5.5C4 4.7 4.7 4 5.5 4H18.5C19.3 4 20 4.7 20 5.5V14.5C20 15.3 19.3 16 18.5 16H9L5 19.5V16H5.5C4.7 16 4 15.3 4 14.5V5.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="8.5" cy="10" r="1" fill="currentColor"/>
    <circle cx="12" cy="10" r="1" fill="currentColor"/>
    <circle cx="15.5" cy="10" r="1" fill="currentColor"/>
  </svg>`,
};

window.ZevaIcons = ZevaIcons;
