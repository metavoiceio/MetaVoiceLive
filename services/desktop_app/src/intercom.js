export const APP_ID = "nuw1fx2r";
export const USER_HASH_KEY = 'MV_USER_HASH';

// Loads Intercom with the snippet
// This must be run before boot, it initializes window.Intercom
export const load = () => {
    (function () { var w = window; var ic = w.Intercom; if (typeof ic === "function") { ic('reattach_activator'); ic('update', w.intercomSettings); } else { var d = document; var i = function () { i.c(arguments); }; i.q = []; i.c = function (args) { i.q.push(args); }; w.Intercom = i; var l = function () { var s = d.createElement('script'); s.type = 'text/javascript'; s.async = true; s.src = 'https://widget.intercom.io/widget/' + APP_ID; var x = d.getElementsByTagName('script')[0]; x.parentNode.insertBefore(s, x); }; if (document.readyState === 'complete') { l(); } else if (w.attachEvent) { w.attachEvent('onload', l); } else { w.addEventListener('load', l, false); } } })();
}

// Initializes Intercom
export const boot = (options = {}) => {
    window &&
        window.Intercom &&
        window.Intercom("boot", { app_id: APP_ID, ...options })
}

// This method just calls Intercom('update'), which should be run on every page
// change. This does two things:
// 1. Send an update to Intercom to create an impression on the current URL
// 2. Fetch any messages that should be delivered based on the URL and user
export const update = () => {
    window && window.Intercom && window.Intercom("update")
}

// Clears user session and unloads messages
export const shutdown = () => {
    window && window.Intercom && window.Intercom("shutdown")
}
