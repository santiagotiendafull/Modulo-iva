// Anillo de carga: se usa tanto al entrar a la app como al cambiar de mes o razón social, para que
// el contenido aparezca de una vez ya completo en vez de irse revelando bloque por bloque.
export default function Spinner() {
  return (
    <div className="carga-inicial">
      <span className="spinner-anillo" role="status" aria-label="Cargando" />
    </div>
  );
}
