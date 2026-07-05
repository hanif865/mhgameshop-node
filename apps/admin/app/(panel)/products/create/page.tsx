import { ProductForm } from '@/components/forms/ProductForm';

export default function CreateProduct() {
  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">New Product</h1>
      <ProductForm />
    </div>
  );
}
