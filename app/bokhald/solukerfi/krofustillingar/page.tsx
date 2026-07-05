import { redirect } from "next/navigation";

// Kröfustillingar live with the rest of the bank wiring (innheimtusamningur, kröfusnið,
// útibú, eindagi/lokadagur) on the bankatenging page — one home for all of it.
export default function Page() {
  redirect("/bokhald/bankatenging");
}
