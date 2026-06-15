import { getWeekMeals } from "../meals";
import CheckoutView from "./CheckoutView";

export const metadata = { title: "Ganga frá pöntun — SVO GOTT" };

export default async function CheckoutPage() {
  const meals = await getWeekMeals();
  return <CheckoutView meals={meals} />;
}
