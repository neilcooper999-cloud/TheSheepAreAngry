# The Sheep Are Angry!

A top-down survival game where you play a sheep. A catastrophe has removed all humans from the Earth, and the sheep are making a bid to become the dominant species.

You are Flossy, a ewe with a yellow ear tag. The camera stays centred on her while the world scrolls around her. Graze to stay fed, recruit strays into a flock, and survive the nights. Five or more sheep bunched together form a ring that predators won't break. Your fleece keeps growing and slows you down, so rub it off on rocks and fence posts before you get stuck on your back.

## Play

Open `index.html` in a browser. It is a single file with no build step.

- WASD or arrow keys to move (drag anywhere on a touch screen)
- Space or GRAZE to eat
- Shift or CHARGE to headbutt; rams in your flock charge with you, at predators and at whatever you're breaking
- B or BLEAT to call out with a sonar-like ping; nearby strays answer and show briefly on the screen and on the minimap (wolves hear it at night)
- F or SHEAR to harvest wool from your flock (needs shears)
- C or CRAFT to open the upgrade tree
- M to turn sound and music off or on

On a touch screen, CHARGE is the big button in the bottom-right corner, with GRAZE, BLEAT, SHEAR and CRAFT in an arc above and to its left. SHEAR only appears once you have shears.

When you graze the whole flock grazes, so a big flock strips a pasture fast, and grass takes many days to grow back. A bigger flock sees further, gathers more and gets a lookout, but it is hungrier and draws more wolves.

You only see the area around Flossy, much less at night. The minimap in the top corner shows the ground you have explored near Flossy and scrolls as she walks. Wolves attack a flock that stands still, but not one circling a moving Flossy.

## Finding sheep

Sheep are rare. There is one ewe and one ram near the start, a few wanderers out in the world, and pens on the old farms with two or three sheep shut inside: charge a pen to break them out. Every sheep has a name, and each one that joins gets a celebration.

## Regions and enemies

The map is split into regions, each with its own mix of resources and danger: Home Meadows (gentle), Old Farmland (barns, tractors, wild sheepdogs), the Wildwood (timber, foxes by day), the Marsh (bog, lost sheep), the Fells (stone, little grass, wolves by day) and the Ruined Town (rich in metal but no grass, and dangerous day and night).

Wolves kill a ewe in one bite. Foxes are smaller and take two bites for a ewe and four for a ram. Rams defend the flock on their own and survive two wolf bites. Wild sheepdogs herd your sheep away; charge one three times to train it, and it patrols around the flock and chases off predators.

## Music

Each region has its own tune, and the music crossfades as you cross into a new one: a gentle pentatonic tune in the Home Meadows, a jaunty fiddle jig with oom-pah bass on the Old Farmland, a breathy dorian flute over a drone in the Wildwood, slow watery minor chords with drips in the Marsh, a lonely horn over bare fifths on the Fells, and a tense pulsing phrygian beat with metal clanks in the Ruined Town. At night the music gets quieter and darker, and the tune comes round less often. It is all made live with WebAudio, so there are no sound files.

## Carrying

The flock can only carry so much: 15 for Flossy, plus 6 for each ewe and 10 for each ram. The bigger builds cost more than Flossy can carry alone.

## Crafting

Every charge at a tree, rock, wreck or building gathers more the better your horns (+1 for each horn tier), the bigger your flock (+1 for every 5 sheep), and the more rams are close by, since each ram charges it with you and adds +1.

You start able to gather only wood. The Ram-horn Helm lets you break rock for stone, and Stone-tipped Horns let you break old cars and tractors for metal. Stone unlocks Flint Shears, which you need before you can harvest wool. Shelter has its own tree, upgraded in place: Wooden Pen, Wool-lined Pen, Drystone Fold, Iron-gated Steading. Wolves chew through the weaker pens.

The top of the tree needs a big flock as well as materials. Iron-shod Horns let you dig old tech out of the Ruined Town. Dynamo Horns (flock of 12) send out a stunning shock with every charge. Laser Horns (flock of 20) fire at predators in range on their own, Ram Laser Rigs (flock of 25 and 3 rams) arm the rams too, and the Laser-fenced Compound (flock of 25) zaps anything that comes near its walls.

## Woolcraft

Wool is free if you keep shearing, so plenty needs it, and in quantity: Fleece Panniers and Felted Saddlebags (the flock carries 20, then 60, more), Woolly Ear-trumpets (your bleat reaches half as far again), Lanolin Balm (Flossy heals twice as fast, and bitten sheep recover sooner) and Knitted Ram Coats (each ram takes one more wolf bite). Most horn upgrades and shelter tiers need wool as well.

## Docs

- `docs/concept.html`: the game concept (core loop, threats, rising to dominance, progression)
