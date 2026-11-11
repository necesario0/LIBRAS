import logo from "../assets/libras-logo.png";

export function Brand() {
  return (
    <span className="brand">
      <img className="brand__logo" src={logo} alt="" />
      Libras
    </span>
  );
}
