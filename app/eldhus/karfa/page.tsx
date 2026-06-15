import { getWeekMeals } from "../meals";
import CartView from "./CartView";

export const metadata = { title: "Karfan — SVO GOTT" };

export default async function KarfaPage() {
  const meals = await getWeekMeals();
  return <CartView meals={meals} />;
}
