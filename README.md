# The Sheep Are Angry!

A top-down survival game where you play a sheep. A catastrophe has removed all humans from the Earth, and the sheep are making a bid to become the dominant species.

You are Flossy, a ewe with a yellow ear tag. The camera stays centred on her while the world scrolls around her. Graze to stay fed, recruit strays into a flock, and survive the nights. Five or more sheep bunched together form a ring that predators won't break. Your fleece keeps growing and slows you down, so rub it off on rocks and fence posts before you get stuck on your back.

## Play

Open `index.html` in a browser. It is a single file with no build step.

- WASD or arrow keys to move (drag anywhere on a touch screen)
- Space or GRAZE to eat
- Shift or CHARGE to headbutt; rams in your flock charge with you
- B or BLEAT to call out; nearby strays answer and show briefly (wolves hear it at night)
- F or SHEAR to harvest wool from your flock (needs shears)
- C or CRAFT to open the upgrade tree

When you graze the whole flock grazes, so a big flock strips a pasture fast, and grass takes many days to grow back. A bigger flock sees further, gathers more and gets a lookout, but it is hungrier and draws more wolves.

You only see the area around Flossy, much less at night. Wolves attack a flock that stands still, but not one circling a moving Flossy.

## Regions and enemies

The map is split into regions, each with its own mix of resources and danger: Home Meadows (gentle), Old Farmland (barns, tractors, wild sheepdogs), the Wildwood (timber, foxes by day), the Marsh (bog, lost sheep), the Fells (stone, little grass, wolves by day) and the Ruined Town (rich in metal but no grass, and dangerous day and night).

Wolves kill a ewe in one bite. Foxes are smaller and take two bites for a ewe and four for a ram. Rams defend the flock on their own and survive two wolf bites. Wild sheepdogs herd your sheep away; charge one three times to train it, and it patrols around the flock and chases off predators.

## Carrying

The flock can only carry so much: 15 for Flossy, plus 6 for each ewe and 10 for each ram. The bigger builds cost more than Flossy can carry alone.

## Crafting

You start able to gather only wood. The Ram-horn Helm lets you break rock for stone, and Stone-tipped Horns let you break old cars and tractors for metal. Stone unlocks Flint Shears, which you need before you can harvest wool. Shelter has its own tree, upgraded in place: Wooden Pen, Wool-lined Pen, Drystone Fold, Iron-gated Steading. Wolves chew through the weaker pens.

## Docs

- `docs/concept.html`: the game concept (core loop, threats, rising to dominance, progression)
