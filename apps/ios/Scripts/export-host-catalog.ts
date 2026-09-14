import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drawingPrompts } from "../../../src/data/drawingPrompts";
import { TOPIC_DECKS } from "../../../src/data/topics";
import { activeSlides } from "../../../src/games/slides/library";

const output = fileURLToPath(new URL(
  "../Sources/TapaCore/Resources/HostCatalog.json",
  import.meta.url,
));

writeFileSync(output, `${JSON.stringify({
  version: 1,
  drawingPrompts,
  debateTopics: TOPIC_DECKS,
  slideIDs: activeSlides.map((slide) => slide.id),
}, null, 2)}\n`);
