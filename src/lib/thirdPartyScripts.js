let didScheduleThirdPartyScripts = false;
let didLoadThirdPartyScripts = false;
const THIRD_PARTY_DELAY_MS = 8000;
const THIRD_PARTY_INTERACTION_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"];

function appendScript({ id, src, inline, async = true }) {
  if (document.getElementById(id)) {
    return;
  }

  const script = document.createElement("script");
  script.id = id;
  script.async = async;

  if (src) {
    script.src = src;
  } else if (inline) {
    script.text = inline;
  }

  document.head.appendChild(script);
}

function loadThirdPartyScripts() {
  if (didLoadThirdPartyScripts) {
    return;
  }

  didLoadThirdPartyScripts = true;

  appendScript({
    id: "ff-gtm",
    inline: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-K54XC2GC');`,
  });

  appendScript({
    id: "ff-meta-pixel",
    inline: `!(function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];
t=b.createElement(e);t.async=true;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s);})(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','2657249931344243');fbq('track','PageView');`,
  });

  appendScript({
    id: "ff-google-analytics",
    src: "https://www.googletagmanager.com/gtag/js?id=G-50V9QHF5WJ",
  });

  appendScript({
    id: "ff-google-analytics-config",
    inline: `window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','G-50V9QHF5WJ');`,
  });

  appendScript({
    id: "ff-inlyne-preview",
    src: "https://app.inlyne.ai/scripts/preview.js",
  });
}

export function scheduleThirdPartyScripts() {
  if (didScheduleThirdPartyScripts || typeof window === "undefined" || !import.meta.env.PROD) {
    return;
  }

  didScheduleThirdPartyScripts = true;

  const scheduleIdle = (callback) => {
    const schedule = window.requestIdleCallback || ((idleCallback) => window.setTimeout(idleCallback, 1200));
    schedule(callback, { timeout: 3000 });
  };

  const cleanup = () => {
    THIRD_PARTY_INTERACTION_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, handleFirstInteraction);
    });
  };

  const start = () => {
    cleanup();
    scheduleIdle(loadThirdPartyScripts);
  };

  function handleFirstInteraction() {
    start();
  }

  THIRD_PARTY_INTERACTION_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, handleFirstInteraction, { once: true, passive: true });
  });

  window.addEventListener("load", () => {
    window.setTimeout(start, THIRD_PARTY_DELAY_MS);
  }, { once: true });
}
