import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/photobook/Studio";

export const Route = createFileRoute("/")({ component: Studio });
