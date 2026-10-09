import Link from "next/link";
import s from "./Header.module.css";

export default function Header({ right }) {
  return (
    <header className={s.header}>
      <Link href="/" className={s.brand}>Javis <span>·</span> AI interview coach</Link>
      {right && <div className={s.right}>{right}</div>}
    </header>
  );
}
