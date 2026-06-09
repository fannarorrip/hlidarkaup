export interface Product {
  id: string;
  name: string;
  description: string;
  price: number; // in ISK (króna)
  image?: string;
  category?: string;
  stock?: number; // units in stock; 0 = sold out
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Order {
  items: CartItem[];
  customerName: string;
  customerPhone: string;
  deliveryType: "pickup" | "delivery";
  pickupTime: string;
  deliveryAddress?: string;
  shippingCost: number;
  total: number;
}
