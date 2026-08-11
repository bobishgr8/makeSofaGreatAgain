import { ButtonHTMLAttributes } from "react";
export default function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
