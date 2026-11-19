import logo from "../assets/libras-logo.png";

export function Brand() {
  return (
    <span className="brand">
      <img className="brand__logo" src={logo} alt="" />
      <span className="brand__name">
        Libras
        <span className="brand__dot" aria-hidden="true" />
      </span>
    </span>
  );
}
