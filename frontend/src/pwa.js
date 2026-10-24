import { useEffect, useState } from 'react';

function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Chrome/Edge/Android avisan con `beforeinstallprompt` cuando la app se puede instalar; hay que
// guardar el evento y dispararlo desde un botón propio. iOS Safari no lo emite: ahí solo se puede
// instalar desde Compartir → "Agregar a inicio", por eso se expone `esIOS` para mostrar la pista.
export function useInstalarApp() {
  const [evento, setEvento] = useState(null);
  const [instalada, setInstalada] = useState(estaInstalada);

  useEffect(() => {
    const alOfrecer = (e) => { e.preventDefault(); setEvento(e); };
    const alInstalar = () => { setEvento(null); setInstalada(true); };
    window.addEventListener('beforeinstallprompt', alOfrecer);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alOfrecer);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  async function instalar() {
    if (!evento) return;
    evento.prompt();
    await evento.userChoice;
    setEvento(null);
  }

  const esIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  return { instalada, puedeInstalar: !!evento, instalar, mostrarPistaIOS: esIOS && !instalada };
}

export function useOnline() {
  const [online, setOnline] = useState(() => window.navigator.onLine);
  useEffect(() => {
    const alCambiar = () => setOnline(window.navigator.onLine);
    window.addEventListener('online', alCambiar);
    window.addEventListener('offline', alCambiar);
    return () => {
      window.removeEventListener('online', alCambiar);
      window.removeEventListener('offline', alCambiar);
    };
  }, []);
  return online;
}
