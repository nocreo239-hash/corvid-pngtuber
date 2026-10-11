// Fuente de navegador para OBS: recibe el estado de la app y dibuja el avatar.
const view = new AvatarView(document.getElementById('stage'), makeResolver('http'));
const events = new EventSource('/events');
events.onmessage = (e) => {
  try { view.apply(JSON.parse(e.data)); } catch (err) { console.error(err); }
};
