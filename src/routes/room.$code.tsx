import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/room/$code")({
  head: () => ({
    meta: [
      { title: "Кімната гри — Хроніки Майстра" },
      { name: "description", content: "Онлайн-кімната для спільної пригоди в Хроніках Майстра." },
      { property: "og:title", content: "Кімната гри — Хроніки Майстра" },
      { property: "og:description", content: "Приєднуйтесь до загону друзів." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Room,
});

function Room() {
  const { code } = Route.useParams();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-night p-6 text-center">
      <p className="font-display text-xs text-gold">{code}</p>
      <h1 className="title-glow text-lg">Онлайн-кімнати ще в роботі</h1>
      <p className="max-w-md text-parchment">Кімнату створено, але екран лобі та спільної гри ще не готовий.</p>
      <Link to="/" className="text-gold underline">← На головну</Link>
    </main>
  );
}
