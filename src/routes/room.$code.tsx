import { createFileRoute } from "@tanstack/react-router";
import { OnlineRoom } from "@/game/components/OnlineRoom";

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
  return <OnlineRoom code={code.toUpperCase()} />;
}
