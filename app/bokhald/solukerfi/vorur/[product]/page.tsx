import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductDetail } from "@/lib/accounting-queries";
import { getProductVelocity, suggestReorderQty } from "@/lib/purchase-orders";
import ProductForm from "./ProductForm";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const data = await getProductDetail(product);
  if (!data) notFound();

  const vel = await getProductVelocity(product);
  const est = suggestReorderQty({
    stock: Number(data.product.stock_quantity) || 0,
    reorderPoint: Number(data.product.reorder_point) || 0,
    reorderQty: data.product.reorder_qty != null ? Number(data.product.reorder_qty) : null,
    sold30: vel.sold30, sold90: vel.sold90,
  });

  return (
    <div>
      <Link href="/bokhald/solukerfi/vorur" className="text-sm text-gray-500 hover:underline">← Vörur</Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">
        <span className="font-mono text-gray-400 mr-2">{data.product.product_number}</span>
        {data.product.name}
      </h1>
      <ProductForm
        product={data.product}
        barcodes={data.barcodes}
        salesHint={{ sold30: Math.round(vel.sold30), monthly: est.monthlyDemand, suggested: est.suggested, basis: est.basis }}
      />
    </div>
  );
}
