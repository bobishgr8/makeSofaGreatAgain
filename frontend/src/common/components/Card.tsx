import { HTMLAttributes } from "react";
export default function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <article className={`card ${className}`} {...props} />;
}
