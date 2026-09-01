import { createFileRoute } from "@tanstack/react-router";
import { NetworkExplorer } from "@/components/network/NetworkExplorer";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <NetworkExplorer />;
}
