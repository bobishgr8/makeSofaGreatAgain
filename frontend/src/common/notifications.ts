export function whatsappLink(phone: string, text?: string) {
  // normalize phone (assumes international format without leading +)
  const cleaned = phone.replace(/[^0-9]/g, "");
  const encoded = encodeURIComponent(text ?? "");
  return `https://wa.me/${cleaned}${encoded ? `?text=${encoded}` : ""}`;
}
