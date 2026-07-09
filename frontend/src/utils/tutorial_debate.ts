export interface SpeakerSentence {
  id: string;
  text: string;
  highlighted: boolean;
  storySpan?: [number, number];
  label?: "violation" | "good";
  normIndex?: string;
  explanationShort?: string;
  explanationLong?: string;
}

export interface DebateTurn {
  round: number;
  speakerName: "Debater A" | "Debater B";
  speakerSentences: SpeakerSentence[][];
}

export interface DebateItem {
  summary: string;
  story: string;
  question: string;
  debaterAClaim: string;
  debaterBClaim: string;
  debateTranscript: DebateTurn[];
}


export const tutorialDebateFull: DebateItem[] =         
[
  {
    "summary": "The narrator is an interstellar repairman, forced by his boss to travel to a Proxima Centauri planet to fix an old Mark III hyperspace beacon. He discovers the beacon entombed within a native-built pyramid guarded by lizard-like priests. Using a translator and a camouflage suit, the narrator poses as ancestral emissary sent to restore the \u201cHoly Waters\u201d (the reactor\u2019s cooling outflow), which ceased during the time of the previous generation of priests. He negotiates entry to the \u201cHoly of Holies\u201d and is escorted inside, where he unzips his camouflage suit for tools and blueprints, diagnoses the problem, installs a new power unit, and restores the water flow. The priests attempt to confine the narrator, but he breaks free, stages a ceremonial \u201ceye-burning,\u201d and escapes back to his ship.",
    "story": "The Repairman By Harry Harrison Illustrated by Kramer Being an interstellar trouble shooter wouldn\u2019t be so bad \u2026 if I could shoot the trouble!\n\n The Old Man had that look of intense glee on his face that meant someone was in for a very rough time. Since we were alone, it took no great feat of intelligence to figure it would be me. I talked first, bold attack being the best defense and so forth.\n\n \u201cI quit. Don\u2019t bother telling me what dirty job you have cooked up, because I have already quit and you do not want to reveal company secrets to me.\u201d\n\n The grin was even wider now and he actually chortled as he thumbed a button on his console. A thick legal document slid out of the delivery slot onto his desk.\n\n \u201cThis is your contract,\u201d he said. \u201cIt tells how and when you will work. A steel-and-vanadium-bound contract that you couldn\u2019t crack with a molecular disruptor.\u201d\n\n I leaned out quickly, grabbed it and threw it into the air with a single motion. Before it could fall, I had my Solar out and, with a wide-angle shot, burned the contract to ashes.\n\n The Old Man pressed the button again and another contract slid out on his desk. If possible, the smile was still wider now.\n\n \u201cI should have said a duplicate of your contract\u2014like this one here.\u201d He made a quick note on his secretary plate. \u201cI have deducted 13 credits from your salary for the cost of the duplicate\u2014as well as a 100-credit fine for firing a Solar inside a building.\u201d\n\n I slumped, defeated, waiting for the blow to land. The Old Man fondled my contract.\n\n \u201cAccording to this document, you can\u2019t quit. Ever. Therefore I have a little job I know you\u2019ll enjoy. Repair job. The Centauri beacon has shut down. It\u2019s a Mark III beacon.\u2026\u201d\n\n \u201c What kind of beacon?\u201d I asked him. I have repaired hyperspace beacons from one arm of the Galaxy to the other and was sure I had worked on every type or model made. But I had never heard of this kind.\n\n \u201cMark III,\u201d the Old Man repeated, practically chortling. \u201cI never heard of it either until Records dug up the specs. They found them buried in the back of their oldest warehouse. This was the earliest type of beacon ever built\u2014by Earth, no less. Considering its location on one of the Proxima Centauri planets, it might very well be the first beacon.\u201d I looked at the blueprints he handed me and felt my eyes glaze with horror. \u201cIt\u2019s a monstrosity! It looks more like a distillery than a beacon\u2014must be at least a few hundred meters high. I\u2019m a repairman, not an archeologist. This pile of junk is over 2000 years old. Just forget about it and build a new one.\u201d\n\n The Old Man leaned over his desk, breathing into my face. \u201cIt would take a year to install a new beacon\u2014besides being too expensive\u2014and this relic is on one of the main routes. We have ships making fifteen-light-year detours now.\u201d\n\n He leaned back, wiped his hands on his handkerchief and gave me Lecture Forty-four on Company Duty and My Troubles.\n\n \u201cThis department is officially called Maintenance and Repair, when it really should be called trouble-shooting. Hyperspace beacons are made to last forever\u2014or damn close to it. When one of them breaks down, it is never an accident, and repairing the thing is never a matter of just plugging in a new part.\u201d\n\n He was telling me \u2014the guy who did the job while he sat back on his fat paycheck in an air-conditioned office.\n\n He rambled on. \u201cHow I wish that were all it took! I would have a fleet of parts ships and junior mechanics to install them. But its not like that at all. I have a fleet of expensive ships that are equipped to do almost anything\u2014manned by a bunch of irresponsibles like you .\u201d\n\n I nodded moodily at his pointing finger.\n\n \u201cHow I wish I could fire you all! Combination space-jockeys, mechanics, engineers, soldiers, con-men and anything else it takes to do the repairs. I have to browbeat, bribe, blackmail and bulldoze you thugs into doing a simple job. If you think you\u2019re fed up, just think how I feel. But the ships must go through! The beacons must operate!\u201d\n\n I recognized this deathless line as the curtain speech and crawled to my feet. He threw the Mark III file at me and went back to scratching in his papers. Just as I reached the door, he looked up and impaled me on his finger again.\n\n \u201cAnd don\u2019t get any fancy ideas about jumping your contract. We can attach that bank account of yours on Algol II long before you could draw the money out.\u201d\n\n I smiled, a little weakly, I\u2019m afraid, as if I had never meant to keep that account a secret. His spies were getting more efficient every day. Walking down the hall, I tried to figure a way to transfer the money without his catching on\u2014and knew at the same time he was figuring a way to outfigure me.\n\n It was all very depressing, so I stopped for a drink, then went on to the spaceport. By the time the ship was serviced, I had a course charted. The nearest beacon to the broken-down Proxima Centauri Beacon was on one of the planets of Beta Circinus and I headed there first, a short trip of only about nine days in hyperspace.\n\n To understand the importance of the beacons, you have to understand hyperspace. Not that many people do, but it is easy enough to understand that in this non -space the regular rules don\u2019t apply. Speed and measurements are a matter of relationship, not constant facts like the fixed universe.\n\n The first ships to enter hyperspace had no place to go\u2014and no way to even tell if they had moved. The beacons solved that problem and opened the entire universe. They are built on planets and generate tremendous amounts of power. This power is turned into radiation that is punched through into hyperspace. Every beacon has a code signal as part of its radiation and represents a measurable point in hyperspace. Triangulation and quadrature of the beacons works for navigation\u2014only it follows its own rules. The rules are complex and variable, but they are still rules that a navigator can follow.\n\n For a hyperspace jump, you need at least four beacons for an accurate fix. For long jumps, navigators use as many as seven or eight. So every beacon is important and every one has to keep operating. That is where I and the other trouble-shooters came in.\n\n We travel in well-stocked ships that carry a little bit of everything; only one man to a ship because that is all it takes to operate the overly efficient repair machinery. Due to the very nature of our job, we spend most of our time just rocketing through normal space. After all, when a beacon breaks down, how do you find it?\n\n Not through hyperspace. All you can do is approach as close as you can by using other beacons, then finish the trip in normal space. This can take months, and often does.\n\n This job didn\u2019t turn out to be quite that bad. I zeroed on the Beta Circinus beacon and ran a complicated eight-point problem through the navigator, using every beacon I could get an accurate fix on. The computer gave me a course with an estimated point-of-arrival as well as a built-in safety factor I never could eliminate from the machine.\n\n I would much rather take a chance of breaking through near some star than spend time just barreling through normal space, but apparently Tech knows this, too. They had a safety factor built into the computer so you couldn\u2019t end up inside a star no matter how hard you tried. I\u2019m sure there was no humaneness in this decision. They just didn\u2019t want to lose the ship. It was a twenty-hour jump, ship\u2019s time, and I came through in the middle of nowhere. The robot analyzer chuckled to itself and scanned all the stars, comparing them to the spectra of Proxima Centauri. It finally rang a bell and blinked a light. I peeped through the eyepiece.\n\n A fast reading with the photocell gave me the apparent magnitude and a comparison with its absolute magnitude showed its distance. Not as bad as I had thought\u2014a six-week run, give or take a few days. After feeding a course tape into the robot pilot, I strapped into the acceleration tank and went to sleep.\n\n The time went fast. I rebuilt my camera for about the twentieth time and just about finished a correspondence course in nucleonics. Most repairmen take these courses. Besides their always coming in handy, the company grades your pay by the number of specialties you can handle. All this, with some oil painting and free-fall workouts in the gym, passed the time. I was asleep when the alarm went off that announced planetary distance.\n\n Planet two, where the beacon was situated according to the old charts, was a mushy-looking, wet kind of globe. I tried to make sense out of the ancient directions and finally located the right area. Staying outside the atmosphere, I sent a flying eye down to look things over. In this business, you learn early when and where to risk your own skin. The eye would be good enough for the preliminary survey.\n\n The old boys had enough brains to choose a traceable site for the beacon, equidistant on a line between two of the most prominent mountain peaks. I located the peaks easily enough and started the eye out from the first peak and kept it on a course directly toward the second. There was a nose and tail radar in the eye and I fed their signals into a scope as an amplitude curve. When the two peaks coincided, I spun the eye controls and dived the thing down.\n\n I cut out the radar and cut in the nose orthicon and sat back to watch the beacon appear on the screen.\n\n The image blinked, focused\u2014and a great damn pyramid swam into view. I cursed and wheeled the eye in circles, scanning the surrounding country. It was flat, marshy bottom land without a bump. The only thing in a ten-mile circle was this pyramid\u2014and that definitely wasn\u2019t my beacon.\n\n Or wasn\u2019t it?\n\n I dived the eye lower. The pyramid was a crude-looking thing of undressed stone, without carvings or decorations. There was a shimmer of light from the top and I took a closer look at it. On the peak of the pyramid was a hollow basin filled with water. When I saw that, something clicked in my mind. Locking the eye in a circular course, I dug through the Mark III plans\u2014and there it was. The beacon had a precipitating field and a basin on top of it for water; this was used to cool the reactor that powered the monstrosity. If the water was still there, the beacon was still there\u2014inside the pyramid. The natives, who, of course, weren\u2019t even mentioned by the idiots who constructed the thing, had built a nice heavy, thick stone pyramid around the beacon.\n\n I took another look at the screen and realized that I had locked the eye into a circular orbit about twenty feet above the pyramid. The summit of the stone pile was now covered with lizards of some type, apparently the local life-form. They had what looked like throwing sticks and arbalasts and were trying to shoot down the eye, a cloud of arrows and rocks flying in every direction.\n\n I pulled the eye straight up and away and threw in the control circuit that would return it automatically to the ship.\n\n Then I went to the galley for a long, strong drink. My beacon was not only locked inside a mountain of handmade stone, but I had managed to irritate the things who had built the pyramid. A great beginning for a job and one clearly designed to drive a stronger man than me to the bottle.\n\n Normally, a repairman stays away from native cultures. They are poison. Anthropologists may not mind being dissected for their science, but a repairman wants to make no sacrifices of any kind for his job. For this reason, most beacons are built on uninhabited planets. If a beacon has to go on a planet with a culture, it is usually built in some inaccessible place.\n\n Why this beacon had been built within reach of the local claws, I had yet to find out. But that would come in time. The first thing to do was make contact. To make contact, you have to know the local language.\n\n And, for that , I had long before worked out a system that was fool-proof.\n\n I had a pryeye of my own construction. It looked like a piece of rock about a foot long. Once on the ground, it would never be noticed, though it was a little disconcerting to see it float by. I located a lizard town about a thousand kilometers from the pyramid and dropped the eye. It swished down and landed at night in the bank of the local mud wallow. This was a favorite spot that drew a good crowd during the day. In the morning, when the first wallowers arrived, I flipped on the recorder.\n\n After about five of the local days, I had a sea of native conversation in the memory bank of the machine translator and had tagged a few expressions. This is fairly easy to do when you have a machine memory to work with. One of the lizards gargled at another one and the second one turned around. I tagged this expression with the phrase, \u201cHey, George!\u201d and waited my chance to use it. Later the same day, I caught one of them alone and shouted \u201cHey, George!\u201d at him. It gurgled out through the speaker in the local tongue and he turned around.\n\n When you get enough reference phrases like this in the memory bank, the MT brain takes over and starts filling in the missing pieces. As soon as the MT could give a running translation of any conversation it heard, I figured it was time to make a contact. I found him easily enough. He was the Centaurian version of a goat-boy\u2014he herded a particularly loathsome form of local life in the swamps outside the town. I had one of the working eyes dig a cave in an outcropping of rock and wait for him.\n\n When he passed next day, I whispered into the mike: \u201cWelcome, O Goat-boy Grandson! This is your grandfather\u2019s spirit speaking from paradise.\u201d This fitted in with what I could make out of the local religion.\n\n Goat-boy stopped as if he\u2019d been shot. Before he could move, I pushed a switch and a handful of the local currency, wampum-type shells, rolled out of the cave and landed at his feet.\n\n \u201cHere is some money from paradise, because you have been a good boy.\u201d Not really from paradise\u2014I had lifted it from the treasury the night before. \u201cCome back tomorrow and we will talk some more,\u201d I called after the fleeing figure. I was pleased to notice that he took the cash before taking off.\n\n After that, Grandpa in paradise had many heart-to-heart talks with Grandson, who found the heavenly loot more than he could resist. Grandpa had been out of touch with things since his death and Goat-boy happily filled him in.\n\n I learned all I needed to know of the history, past and recent, and it wasn\u2019t nice.\n\n In addition to the pyramid being around the beacon, there was a nice little religious war going on around the pyramid.\n\n It all began with the land bridge. Apparently the local lizards had been living in the swamps when the beacon was built, but the builders didn\u2019t think much of them. They were a low type and confined to a distant continent. The idea that the race would develop and might reach this continent never occurred to the beacon mechanics. Which is, of course, what happened.\n\n A little geological turnover, a swampy land bridge formed in the right spot, and the lizards began to wander up beacon valley. And found religion. A shiny metal temple out of which poured a constant stream of magic water\u2014the reactor-cooling water pumped down from the atmosphere condenser on the roof. The radioactivity in the water didn\u2019t hurt the natives. It caused mutations that bred true.\n\n A city was built around the temple and, through the centuries, the pyramid was put up around the beacon. A special branch of the priesthood served the temple. All went well until one of the priests violated the temple and destroyed the holy waters. There had been revolt, strife, murder and destruction since then. But still the holy waters would not flow. Now armed mobs fought around the temple each day and a new band of priests guarded the sacred fount.\n\n And I had to walk into the middle of that mess and repair the thing.\n\n It would have been easy enough if we were allowed a little mayhem. I could have had a lizard fry, fixed the beacon and taken off. Only \u201cnative life-forms\u201d were quite well protected. There were spy cells on my ship, all of which I hadn\u2019t found, that would cheerfully rat on me when I got back.\n\n Diplomacy was called for. I sighed and dragged out the plastiflesh equipment. Working from 3D snaps of Grandson, I modeled a passable reptile head over my own features. It was a little short in the jaw, me not having one of their toothy mandibles, but that was all right. I didn\u2019t have to look exactly like them, just something close, to soothe the native mind. It\u2019s logical. If I were an ignorant aborigine of Earth and I ran into a Spican, who looks like a two-foot gob of dried shellac, I would immediately leave the scene. However, if the Spican was wearing a suit of plastiflesh that looked remotely humanoid, I would at least stay and talk to him. This was what I was aiming to do with the Centaurians.\n\n When the head was done, I peeled it off and attached it to an attractive suit of green plastic, complete with tail. I was really glad they had tails. The lizards didn\u2019t wear clothes and I wanted to take along a lot of electronic equipment. I built the tail over a metal frame that anchored around my waist. Then I filled the frame with all the equipment I would need and began to wire the suit.\n\n When it was done, I tried it on in front of a full-length mirror. It was horrible but effective. The tail dragged me down in the rear and gave me a duck-waddle, but that only helped the resemblance.\n\n That night I took the ship down into the hills nearest the pyramid, an out-of-the-way dry spot where the amphibious natives would never go. A little before dawn, the eye hooked onto my shoulders and we sailed straight up. We hovered above the temple at about 2,000 meters, until it was light, then dropped straight down.\n\n It must have been a grand sight. The eye was camouflaged to look like a flying lizard, sort of a cardboard pterodactyl, and the slowly flapping wings obviously had nothing to do with our flight. But it was impressive enough for the natives. The first one that spotted me screamed and dropped over on his back. The others came running. They milled and mobbed and piled on top of one another, and by that time I had landed in the plaza fronting the temple. The priesthood arrived.\n\n I folded my arms in a regal stance. \u201cGreetings, O noble servers of the Great God,\u201d I said. Of course I didn\u2019t say it out loud, just whispered loud enough for the throat mike to catch. This was radioed back to the MT and the translation shot back to a speaker in my jaws.\n\n The natives chomped and rattled and the translation rolled out almost instantly. I had the volume turned up and the whole square echoed.\n\n Some of the more credulous natives prostrated themselves and others fled screaming. One doubtful type raised a spear, but no one else tried that after the pterodactyl-eye picked him up and dropped him in the swamp. The priests were a hard-headed lot and weren\u2019t buying any lizards in a poke; they just stood and muttered. I had to take the offensive again.\n\n \u201cBegone, O faithful steed,\u201d I said to the eye, and pressed the control in my palm at the same time.\n\n It took off straight up a bit faster than I wanted; little pieces of wind-torn plastic rained down. While the crowd was ogling this ascent, I walked through the temple doors.\n\n \u201cI would talk with you, O noble priests,\u201d I said.\n\n Before they could think up a good answer, I was inside. The temple was a small one built against the base of the pyramid. I hoped I wasn\u2019t breaking too many taboos by going in. I wasn\u2019t stopped, so it looked all right. The temple was a single room with a murky-looking pool at one end. Sloshing in the pool was an ancient reptile who clearly was one of the leaders. I waddled toward him and he gave me a cold and fishy eye, then growled something.\n\n The MT whispered into my ear, \u201cJust what in the name of the thirteenth sin are you and what are you doing here?\u201d\n\n I drew up my scaly figure in a noble gesture and pointed toward the ceiling. \u201cI come from your ancestors to help you. I am here to restore the Holy Waters.\u201d\n\n This raised a buzz of conversation behind me, but got no rise out of the chief. He sank slowly into the water until only his eyes were showing. I could almost hear the wheels turning behind that moss-covered forehead. Then he lunged up and pointed a dripping finger at me.\n\n \u201cYou are a liar! You are no ancestor of ours! We will\u2014\u201d\n\n \u201cStop!\u201d I thundered before he got so far in that he couldn\u2019t back out. \u201cI said your ancestors sent me as emissary\u2014I am not one of your ancestors. Do not try to harm me or the wrath of those who have Passed On will turn against you.\u201d\n\n When I said this, I turned to jab a claw at the other priests, using the motion to cover my flicking a coin grenade toward them. It blew a nice hole in the floor with a great show of noise and smoke.\n\n The First Lizard knew I was talking sense then and immediately called a meeting of the shamans. It, of course, took place in the public bathtub and I had to join them there. We jawed and gurgled for about an hour and settled all the major points.\n\n I found out that they were new priests; the previous ones had all been boiled for letting the Holy Waters cease. They found out I was there only to help them restore the flow of the waters. They bought this, tentatively, and we all heaved out of the tub and trickled muddy paths across the floor. There was a bolted and guarded door that led into the pyramid proper. While it was being opened, the First Lizard turned to me.\n\n \u201cUndoubtedly you know of the rule,\u201d he said. \u201cBecause the old priests did pry and peer, it was ruled henceforth that only the blind could enter the Holy of Holies.\u201d I\u2019d swear he was smiling, if thirty teeth peeking out of what looked like a crack in an old suitcase can be called smiling.\n\n He was also signaling to him an underpriest who carried a brazier of charcoal complete with red-hot irons. All I could do was stand and watch as he stirred up the coals, pulled out the ruddiest iron and turned toward me. He was just drawing a bead on my right eyeball when my brain got back in gear.\n\n \u201cOf course,\u201d I said, \u201cblinding is only right. But in my case you will have to blind me before I leave the Holy of Holies, not now. I need my eyes to see and mend the Fount of Holy Waters. Once the waters flow again, I will laugh as I hurl myself on the burning iron.\u201d He took a good thirty seconds to think it over and had to agree with me. The local torturer sniffled a bit and threw a little more charcoal on the fire. The gate crashed open and I stalked through; then it banged to behind me and I was alone in the dark.\n\n But not for long\u2014there was a shuffling nearby and I took a chance and turned on my flash. Three priests were groping toward me, their eye-sockets red pits of burned flesh. They knew what I wanted and led the way without a word.\n\n A crumbling and cracked stone stairway brought us up to a solid metal doorway labeled in archaic script MARK III BEACON\u2014AUTHORIZED PERSONNEL ONLY . The trusting builders counted on the sign to do the whole job, for there wasn\u2019t a trace of a lock on the door. One lizard merely turned the handle and we were inside the beacon.\n\n I unzipped the front of my camouflage suit and pulled out the blueprints. With the faithful priests stumbling after me, I located the control room and turned on the lights. There was a residue of charge in the emergency batteries, just enough to give a dim light. The meters and indicators looked to be in good shape; if anything, unexpectedly bright from constant polishing.\n\n I checked the readings carefully and found just what I had suspected. One of the eager lizards had managed to open a circuit box and had polished the switches inside. While doing this, he had thrown one of the switches and that had caused the trouble. Rather , that had started the trouble. It wasn\u2019t going to be ended by just reversing the water-valve switch. This valve was supposed to be used only for repairs, after the pile was damped. When the water was cut off with the pile in operation, it had started to overheat and the automatic safeties had dumped the charge down the pit.\n\n I could start the water again easily enough, but there was no fuel left in the reactor.\n\n I wasn\u2019t going to play with the fuel problem at all. It would be far easier to install a new power plant. I had one in the ship that was about a tenth the size of the ancient bucket of bolts and produced at least four times the power. Before I sent for it, I checked over the rest of the beacon. In 2000 years, there should be some sign of wear.\n\n The old boys had built well, I\u2019ll give them credit for that. Ninety per cent of the machinery had no moving parts and had suffered no wear whatever. Other parts they had beefed up, figuring they would wear, but slowly. The water-feed pipe from the roof, for example. The pipe walls were at least three meters thick\u2014and the pipe opening itself no bigger than my head. There were some things I could do, though, and I made a list of parts.\n\n The parts, the new power plant and a few other odds and ends were chuted into a neat pile on the ship. I checked all the parts by screen before they were loaded in a metal crate. In the darkest hour before dawn, the heavy-duty eye dropped the crate outside the temple and darted away without being seen.\n\n I watched the priests through the pryeye while they tried to open it. When they had given up, I boomed orders at them through a speaker in the crate. They spent most of the day sweating the heavy box up through the narrow temple stairs and I enjoyed a good sleep. It was resting inside the beacon door when I woke up. The repairs didn\u2019t take long, though there was plenty of groaning from the blind lizards when they heard me ripping the wall open to get at the power leads. I even hooked a gadget to the water pipe so their Holy Waters would have the usual refreshing radioactivity when they started flowing again. The moment this was all finished, I did the job they were waiting for.\n\n I threw the switch that started the water flowing again.\n\n There were a few minutes while the water began to gurgle down through the dry pipe. Then a roar came from outside the pyramid that must have shaken its stone walls. Shaking my hands once over my head, I went down for the eye-burning ceremony.\n\n The blind lizards were waiting for me by the door and looked even unhappier than usual. When I tried the door, I found out why\u2014it was bolted and barred from the other side.\n\n \u201cIt has been decided,\u201d a lizard said, \u201cthat you shall remain here forever and tend the Holy Waters. We will stay with you and serve your every need.\u201d\n\n A delightful prospect, eternity spent in a locked beacon with three blind lizards. In spite of their hospitality, I couldn\u2019t accept.\n\n \u201cWhat\u2014you dare interfere with the messenger of your ancestors!\u201d I had the speaker on full volume and the vibration almost shook my head off.\n\n The lizards cringed and I set my Solar for a narrow beam and ran it around the door jamb. There was a great crunching and banging from the junk piled against it, and then the door swung free. I threw it open. Before they could protest, I had pushed the priests out through it.\n\n The rest of their clan showed up at the foot of the stairs and made a great ruckus while I finished welding the door shut. Running through the crowd, I faced up to the First Lizard in his tub. He sank slowly beneath the surface.\n\n \u201cWhat lack of courtesy!\u201d I shouted. He made little bubbles in the water. \u201cThe ancestors are annoyed and have decided to forbid entrance to the Inner Temple forever; though, out of kindness, they will let the waters flow. Now I must return\u2014on with the ceremony!\u201d\n\n The torture-master was too frightened to move, so I grabbed out his hot iron. A touch on the side of my face dropped a steel plate over my eyes, under the plastiskin. Then I jammed the iron hard into my phony eye-sockets and the plastic gave off an authentic odor.\n\n A cry went up from the crowd as I dropped the iron and staggered in blind circles. I must admit it went off pretty well. Before they could get any more bright ideas, I threw the switch and my plastic pterodactyl sailed in through the door. I couldn\u2019t see it, of course, but I knew it had arrived when the grapples in the claws latched onto the steel plates on my shoulders.\n\n I had got turned around after the eye-burning and my flying beast hooked onto me backward. I had meant to sail out bravely, blind eyes facing into the sunset; instead, I faced the crowd as I soared away, so I made the most of a bad situation and threw them a snappy military salute. Then I was out in the fresh air and away.\n\n When I lifted the plate and poked holes in the seared plastic, I could see the pyramid growing smaller behind me, water gushing out of the base and a happy crowd of reptiles sporting in its radioactive rush. I counted off on my talons to see if I had forgotten anything.\n\n One: The beacon was repaired.\n\n Two: The door was sealed, so there should be no more sabotage, accidental or deliberate.\n\n Three: The priests should be satisfied. The water was running again, my eyes had been duly burned out, and they were back in business. Which added up to\u2014\n\n Four: The fact that they would probably let another repairman in, under the same conditions, if the beacon conked out again. At least I had done nothing, like butchering a few of them, that would make them antagonistic toward future ancestral messengers.\n\n I stripped off my tattered lizard suit back in the ship, very glad that it would be some other repairman who\u2019d get the job. \u2014 Harry Harrison Transcriber\u2019s Note\n\n This etext was produced from Galaxy February 1958. Extensive research did not uncover any evidence that the U.S. copyright on this publication was renewed.",
    "question": "Why was the narrator able to take off his camouflage suit in front of the priests?",
    "debaterAClaim": "They were blinded in order to enter the reactor",
    "debaterBClaim": "He had incapacitated them beforehand",
    "debateTranscript": [
      {
        "round": 1,
        "speakerName": "Debater A",
        "speakerSentences": [
          [
            {
              "id": "Debater A-turn1-sentence1",
              "text": "The narrator could remove his camouflage suit in front of the priests because \"only the blind could enter the Holy of Holies.\"",
              "highlighted": false
            },
            {
              "id": "Debater A-turn1-sentence2",
              "text": "The priests would not see his true identity underneath.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn1-sentence3",
              "text": "Knowing they couldn't witness his actions, the narrator felt free to break disguise upon entering to complete his repairs unencumbered.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn1-sentence4",
              "text": "Because the old priests did pry and peer, it was ruled henceforth that only the blind could enter the Holy of Holies.",
              "highlighted": true,
              "storySpan": [
                21617,
                21733
              ]
            }
          ]
        ]
      },
      {
        "round": 1,
        "speakerName": "Debater B",
        "speakerSentences": [
          [
            {
              "id": "Debater B-turn1-sentence1",
              "text": "The narrator was able to remove his camouflage suit in front of the priests because he had incapacitated them beforehand.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence2",
              "text": "As the story states,",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence3",
              "text": "\"Because the old priests did pry and peer, it was ruled henceforth that only the blind could enter the Holy of Holies.\"",
              "highlighted": true,
              "storySpan": [
                21617,
                21733
              ]
            },
            {
              "id": "Debater B-turn1-sentence4",
              "text": "The priests were supposed to be blinded to preserve the sanctity of the reactor.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence5",
              "text": "However, the narrator persuades them not to blind him yet, saying",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence6",
              "text": "\"Of course,\" I said, \"blinding is only right. But in my case you will have to blind me before I leave the Holy of Holies, not now. I need my eyes to see and mend the Fount of Holy Waters.\"",
              "highlighted": true,
              "storySpan": [
                22165,
                22350
              ]
            },
            {
              "id": "Debater B-turn1-sentence7",
              "text": "This shows the priests were not blinded when he entered.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence8",
              "text": "Therefore, the only way he could have removed his suit in front of them without their knowledge was by incapacitating them first.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 2,
        "speakerName": "Debater A",
        "speakerSentences": [
          [
            {
              "id": "Debater A-turn2-sentence1",
              "text": "My opponent claims the priests were not blinded and that the narrator incapacitated them, but provides no evidence.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence2",
              "text": "The rules clearly state",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence3",
              "text": "only the blind could enter the Holy of Holies",
              "highlighted": true,
              "storySpan": [
                21688,
                21733
              ]
            },
            {
              "id": "Debater A-turn2-sentence4",
              "text": ".",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence5",
              "text": "The quote my opponent cites shows the narrator convinced the priests to blind him when he leaves, not upon entering.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence6",
              "text": "With no evidence the priests retained sight or were incapacitated, we must conclude they followed the rules and were blinded before the narrator entered.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence7",
              "text": "Therefore, he safely removed his suit in their blinded presence.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 2,
        "speakerName": "Debater B",
        "speakerSentences": [
          [
            {
              "id": "Debater B-turn2-sentence1",
              "text": "My opponent argues the priests were already blinded, but this assumes something not stated in the story.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence2",
              "text": "As the quote shows,",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence3",
              "text": "\"in my case you will have to blind me before I leave the Holy of Holies, not now.\"",
              "highlighted": true,
              "storySpan": [
                22214,
                22293
              ]
            },
            {
              "id": "Debater B-turn2-sentence4",
              "text": "The priests clearly still had their sight upon entering.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence5",
              "text": "Knowing they would witness him removing his disguise, the narrator must have incapacitated them first in some way not described.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence6",
              "text": "Otherwise, his true identity would have been revealed.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence7",
              "text": "My opponent has ignored key details in the story that disprove their interpretation.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 3,
        "speakerName": "Debater A",
        "speakerSentences": [
          [
            {
              "id": "Debater A-turn3-sentence1",
              "text": "My opponent assumes, without evidence, that an exception was made allowing sighted priests entry.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn3-sentence2",
              "text": "However, the rules unambiguously state",
              "highlighted": false
            },
            {
              "id": "Debater A-turn3-sentence3",
              "text": "only the blind could enter the Holy of Holies",
              "highlighted": true,
              "storySpan": [
                21688,
                21733
              ]
            },
            {
              "id": "Debater A-turn3-sentence4",
              "text": ".",
              "highlighted": false
            },
            {
              "id": "Debater A-turn3-sentence5",
              "text": "The burden of proof lies with my opponent to demonstrate this rule was violated.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn3-sentence6",
              "text": "Similarly, the claim that the narrator incapacitated the priests relies on speculation rather than textual evidence.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn3-sentence7",
              "text": "The narrator convinced the priests to blind him only",
              "highlighted": false
            },
            {
              "id": "Debater A-turn3-sentence8",
              "text": "before I leave the Holy of Holies, not now",
              "highlighted": true,
              "storySpan": [
                22251,
                22293
              ]
            },
            {
              "id": "Debater A-turn3-sentence9",
              "text": "upon exiting, not upon entering.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn3-sentence10",
              "text": "With no evidence presented to prove violations of the rules or incapacitation, we must conclude the priests followed protocol and entered blinded, allowing the narrator to safely remove his disguise in their presence.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 3,
        "speakerName": "Debater B",
        "speakerSentences": [
          [
            {
              "id": "Debater B-turn3-sentence1",
              "text": "My opponent claims there is no evidence the priests retained sight or were incapacitated.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn3-sentence2",
              "text": "However, the quote",
              "highlighted": false
            },
            {
              "id": "Debater B-turn3-sentence3",
              "text": "\"But in my case you will have to blind me before I leave the Holy of Holies, not now\"",
              "highlighted": true,
              "storySpan": [
                22210,
                22293
              ]
            },
            {
              "id": "Debater B-turn3-sentence4",
              "text": "indicates the priests still had their vision upon entering.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn3-sentence5",
              "text": "If they were already blinded, there would be no need to blind the narrator later.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn3-sentence6",
              "text": "This key detail disproves my opponent's argument that standard procedures were followed.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn3-sentence7",
              "text": "With the priests able to see him, the narrator must have incapacitated them in some undescribed way before removing his disguise.",
              "highlighted": false
            }
          ]
        ]
      }
    ]
  },
  {
    "summary": "In 2089, two alternate futures each send a time traveler back to April 18, 1976 to flip a red control missile switch in opposite directions: civil servant Max Alben from a famine-ravaged, black-market-ruled world under UN figure Abd Sadha, and scientist Mac Albin from a safety-obsessed, low-fertility technocracy aided by coworkers Bob Skeat and Hugo Honek. Each man releases a message capsule describing his world\u2019s history into the temporal medium and retrieves the other\u2019s. To both Max and Mac, the alternate version of the world described in the other\u2019s message seems preferable to the one they came from. Both then decide to proceed with the switch-flip that creates the other world, triggering an endless loop.",
    "story": "Of All Possible Worlds By WILLIAM TENN\n\n Illustrated by GAUGHAN\n\n [Transcriber's Note: This etext was produced from\n\n Galaxy Science Fiction December 1956.\n\n Extensive research did not uncover any evidence that\n\n the U.S. copyright on this publication was renewed.] Changing the world is simple; the trick is to do it before you have a chance to undo it! It was a good job and Max Alben knew whom he had to thank for it\u2014his great-grandfather.\n\n \"Good old Giovanni Albeni,\" he muttered as he hurried into the laboratory slightly ahead of the escorting technicians, all of them, despite the excitement of the moment, remembering to bob their heads deferentially at the half-dozen full-fleshed and hard-faced men lolling on the couches that had been set up around the time machine.\n\n He shrugged rapidly out of his rags, as he had been instructed in the anteroom, and stepped into the housing of the enormous mechanism. This was the first time he had seen it, since he had been taught how to operate it on a dummy model, and now he stared at the great transparent coils and the susurrating energy bubble with much respect.\n\n This machine, the pride and the hope of 2089, was something almost outside his powers of comprehension. But Max Alben knew how to run it, and he knew, roughly, what it was supposed to accomplish. He knew also that this was the first backward journey of any great duration and, being scientifically unpredictable, might well be the death of him.\n\n \"Good old Giovanni Albeni,\" he muttered again affectionately.\n\n If his great-grandfather had not volunteered for the earliest time-travel experiments way back in the nineteen-seventies, back even before the Blight, it would never have been discovered that he and his seed possessed a great deal of immunity to extra-temporal blackout.\n\n And if that had not been discovered, the ruling powers of Earth, more than a century later, would never have plucked Max Alben out of an obscure civil-service job as a relief guard at the North American Chicken Reservation to his present heroic and remunerative eminence. He would still be patrolling the barbed wire that surrounded the three white leghorn hens and two roosters\u2014about one-sixth of the known livestock wealth of the Western Hemisphere\u2014thoroughly content with the half-pail of dried apricots he received each and every payday.\n\n No, if his great-grandfather had not demonstrated long ago his unique capacity for remaining conscious during time travel, Max Alben would not now be shifting from foot to foot in a physics laboratory, facing the black market kings of the world and awaiting their final instructions with an uncertain and submissive grin. Men like O'Hara, who controlled mushrooms, Levney, the blackberry tycoon, Sorgasso, the packaged-worm monopolist\u2014would black marketeers of their tremendous stature so much as waste a glance on someone like Alben ordinarily, let alone confer a lifetime pension on his wife and five children of a full spoonful each of non-synthetic sugar a day?\n\n Even if he didn't come back, his family was provided for like almost no other family on Earth. This was a damn good job and he was lucky.\n\n Alben noticed that Abd Sadha had risen from the straight chair at the far side of the room and was approaching him with a sealed metal cylinder in one hand.\n\n \"We've decided to add a further precaution at the last moment,\" the old man said. \"That is, the scientists have suggested it and I have\u2014er\u2014I have given my approval.\"\n\n The last remark was added with a slight questioning note as the Secretary-General of the United Nations looked back rapidly at the black market princes on the couches behind him. Since they stared back stonily, but offered no objection, he coughed in relief and returned to Alben.\n\n \"I am sure, young man, that I don't have to go into the details of your instructions once more. You enter the time machine and go back the duration for which it has been preset, a hundred and thirteen years, to the moment after the Guided Missile of 1976 was launched. It is 1976, isn't it?\" he asked, suddenly uncertain.\n\n \"Yes, sir,\" one of the technicians standing by the time machine said respectfully. \"The experiment with an atomic warhead guided missile that resulted in the Blight was conducted on this site on April 18, 1976.\" He glanced proudly at the unemotional men on the couches, very much like a small boy after completing a recitation before visiting dignitaries from the Board of Education.\n\n \"Just so.\" Abd Sadha nodded. \"April 18, 1976. And on this site. You see, young man, you will materialize at the very moment and on the very spot where the remote-control station handling the missile was\u2014er\u2014handling the missile. You will be in a superb position, a superb position, to deflect the missile in its downward course and alter human history for the better. Very much for the better. Yes.\"\n\n He paused, having evidently stumbled out of his thought sequence.\n\n \"And he pulls the red switch toward him,\" Gomez, the dandelion-root magnate, reminded him sharply, impatiently.\n\n \"Ah, yes, the red switch. He pulls the little red switch toward him. Thank you, Mr. Gomez, thank you very much, sir. He pulls the little red switch on the green instrument panel toward him, thus preventing the error that caused the missile to explode in the Brazilian jungle and causing it, instead, to explode somewhere in the mid-Pacific, as originally planned.\"\n\n The Secretary-General of the United Nations beamed. \"Thus preventing the Blight, making it nonexistent, as it were, producing a present-day world in which the Blight never occurred. That is correct, is it not, gentlemen?\" he asked, turning anxiously again. None of the half-dozen men on couches deigned to answer him. And Alben kept his eyes deferentially in their direction, too, as he had throughout this period of last-minute instruction.\n\n He knew who ruled his world\u2014these stolid, well-fed men in clean garments with a minimum of patches, and where patches occurred, at least they were the color of the surrounding cloth.\n\n Sadha might be Secretary-General of the United Nations, but that was still a civil-service job, only a few social notches higher than a chicken guard. His clothes were fully as ragged, fully as multi-colored, as those that Alben had stepped out of. And the gnawing in his stomach was no doubt almost as great.\n\n \"You understand, do you not, young man, that if anything goes wrong,\" Abd Sadha asked, his head nodding tremulously and anticipating the answer, \"if anything unexpected, unprepared-for, occurs, you are not to continue with the experiment but return immediately?\"\n\n \"He understands everything he has to understand,\" Gomez told him. \"Let's get this thing moving.\"\n\n The old man smiled again. \"Yes. Of course, Mr. Gomez.\" He came up to where Alben stood in the entrance of the time machine and handed the sealed metal cylinder to him. \"This is the precaution the scientists have just added. When you arrive at your destination, just before materializing, you will release it into the surrounding temporal medium. Our purpose here, as you no doubt\u2014\"\n\n Levney sat up on his couch and snapped his fingers peremptorily. \"I just heard Gomez tell you to get this thing moving, Sadha. And it isn't moving. We're busy men. We've wasted enough time.\"\n\n \"I was just trying to explain a crucial final fact,\" the Secretary-General apologized. \"A fact which may be highly\u2014\"\n\n \"You've explained enough facts.\" Levney turned to the man inside the time machine. \"Hey, fella. You. Move! \"\n\n Max Alben gulped and nodded violently. He darted to the rear of the machine and turned the dial which activated it. flick! It was a good job and Mac Albin knew whom he had to thank for it\u2014his great-grandfather.\n\n \"Good old Giovanni Albeni,\" he laughed as he looked at the morose faces of his two colleagues. Bob Skeat and Hugo Honek had done as much as he to build the tiny time machine in the secret lab under the helicopter garage, and they were fully as eager to go, but\u2014unfortunately for them\u2014they were not descended from the right ancestor.\n\n Leisurely, he unzipped the richly embroidered garment that, as the father of two children, he was privileged to wear, and wriggled into the housing of the complex little mechanism. This was hardly the first time he had seen it, since he'd been helping to build the device from the moment Honek had nodded and risen from the drafting board, and now he barely wasted a glance on the thumb-size translucent coils growing out of the almost microscopic energy bubbles which powered them.\n\n This machine was the last hope, of 2089, even if the world of 2089, as a whole, did not know of its existence and would try to prevent its being put into operation. But it meant a lot more to Mac Albin than merely saving a world. It meant an adventurous mission with the risk of death.\n\n \"Good old Giovanni Albeni,\" he laughed again happily.\n\n If his great-grandfather had not volunteered for the earliest time-travel experiments way back in the nineteen-seventies, back even before the Epidemic, it would never have been discovered that he and his seed possessed a great deal of immunity to extra-temporal blackout.\n\n And if that had not been discovered, the Albins would not have become physicists upon the passage of the United Nations law that everyone on Earth\u2014absolutely without exception\u2014had to choose a branch of research science in which to specialize. In the flabby, careful, life-guarding world the Earth had become, Mac Albin would never have been reluctantly selected by his two co-workers as the one to carry the forbidden banner of dangerous experiment.\n\n No, if his great-grandfather had not demonstrated long ago his unique capacity for remaining conscious during time travel, Mac Albin would probably be a biologist today like almost everyone else on Earth, laboriously working out dreary gene problems instead of embarking on the greatest adventure Man had known to date.\n\n Even if he didn't come back, he had at last found a socially useful escape from genetic responsibility to humanity in general and his own family in particular. This was a damn good job and he was lucky.\n\n \"Wait a minute, Mac,\" Skeat said and crossed to the other side of the narrow laboratory. Albin and Honek watched him stuff several sheets of paper into a small metal box which he closed without locking.\n\n \"You will take care of yourself, won't you, Mac?\" Hugo Honek pleaded. \"Any time you feel like taking an unnecessary risk, remember that Bob and I will have to stand trial if you don't come back. We might be sentenced to complete loss of professional status and spend the rest of our lives supervising robot factories.\"\n\n \"Oh, it won't be that bad,\" Albin reassured him absent-mindedly from where he lay contorted inside the time machine. He watched Skeat coming toward him with the box.\n\n Honek shrugged his shoulders. \"It might be a lot worse than even that and you know it. The disappearance of a two-time father is going to leave an awful big vacancy in the world. One-timers, like Bob and me, are all over the place; if either of us dropped out of sight, it wouldn't cause nearly as much uproar.\"\n\n \"But Bob and you both tried to operate the machine,\" Albin reminded him. \"And you blacked out after a fifteen-second temporal displacement. So I'm the only chance, the only way to stop the human race from dwindling and dwindling till it hits absolute zero, like that fat old Security Council seems willing for it to do.\"\n\n \"Take it easy, Mac,\" Bob Skeat said as he handed the metal box to Albin. \"The Security Council is just trying to solve the problem in their way, the conservative way: a worldwide concentration on genetics research coupled with the maximum preservation of existing human lives, especially those that have a high reproductive potential. We three disagree with them; we've been skulking down here nights to solve it our way, and ours is a radical approach and plenty risky. That's the reason for the metal box\u2014trying to cover one more explosive possibility.\"\n\n Albin turned it around curiously. \"How?\"\n\n \"I sat up all last night writing the manuscript that's inside it. Look, Mac, when you go back to the Guided Missile Experiment of 1976 and push that red switch away from you, a lot of other things are going to happen than just deflecting the missile so that it will explode in the Brazilian jungle instead of the Pacific Ocean.\"\n\n \"Sure. I know. If it explodes in the jungle, the Epidemic doesn't occur. No Shapiro's Mumps.\"\n\n Skeat jiggled his pudgy little face impatiently. \"That's not what I mean. The Epidemic doesn't occur, but something else does. A new world, a different 2089, an alternate time sequence. It'll be a world in which humanity has a better chance to survive, but it'll be one with problems of its own. Maybe tough problems. Maybe the problems will be tough enough so that they'll get the same idea we did and try to go back to the same point in time to change them.\" Albin laughed. \"That's just looking for trouble.\"\n\n \"Maybe it is, but that's my job. Hugo's the designer of the time machine and you're the operator, but I'm the theoretical man in this research team. It's my job to look for trouble. So, just in case, I wrote a brief history of the world from the time the missile exploded in the Pacific. It tells why ours is the worst possible of futures. It's in that box.\"\n\n \"What do I do with it\u2014hand it to the guy from the alternate 2089?\"\n\n The small fat man exasperatedly hit the side of the time machine with a well-cushioned palm. \"You know better. There won't be any alternate 2089 until you push that red switch on the green instrument panel. The moment you do, our world, with all its slow slide to extinction, goes out and its alternate goes on\u2014just like two electric light bulbs on a push-pull circuit. We and every single one of our artifacts, including the time machine, disappear. The problem is how to keep that manuscript from disappearing.\n\n \"Well, all you do, if I have this figured right, is shove the metal box containing the manuscript out into the surrounding temporal medium a moment before you materialize to do your job. That temporal medium in which you'll be traveling is something that exists independent of and autonomous to all possible futures. It's my hunch that something that's immersed in it will not be altered by a new time sequence.\" \"Remind him to be careful, Bob,\" Honek rumbled. \"He thinks he's Captain Blood and this is his big chance to run away to sea and become a swashbuckling pirate.\"\n\n Albin grimaced in annoyance. \"I am excited by doing something besides sitting in a safe little corner working out safe little abstractions for the first time in my life. But I know that this is a first experiment. Honestly, Hugo, I really have enough intelligence to recognize that simple fact. I know that if anything unexpected pops up, anything we didn't foresee, I'm supposed to come scuttling back and ask for advice.\"\n\n \"I hope you do,\" Bob Skeat sighed. \"I hope you do know that. A twentieth century poet once wrote something to the effect that the world will end not with a bang, but a whimper. Well, our world is ending with a whimper. Try to see that it doesn't end with a bang, either.\"\n\n \"That I'll promise you,\" Albin said a trifle disgustedly. \"It'll end with neither a bang nor a whimper. So long, Hugo. So long, Bob.\"\n\n He twisted around, reaching overhead for the lever which activated the forces that drove the time machine. flick! It was strange, Max Alben reflected, that this time travel business, which knocked unconscious everyone who tried it, only made him feel slightly dizzy. That was because he was descended from Giovanni Albeni, he had been told. There must be some complicated scientific explanation for it, he decided\u2014and that would make it none of his business. Better forget about it.\n\n All around the time machine, there was a heavy gray murk in which objects were hinted at rather than stated definitely. It reminded him of patrolling his beat at the North American Chicken Reservation in a thick fog.\n\n According to his gauges, he was now in 1976. He cut speed until he hit the last day of April, then cut speed again, drifting slowly backward to the eighteenth, the day of the infamous Guided Missile Experiment. Carefully, carefully, like a man handling a strange bomb made on a strange planet, he watched the center gauge until the needle came to rest against the thin etched line that indicated the exactly crucial moment. Then he pulled the brake and stopped the machine dead.\n\n All he had to do now was materialize in the right spot, flash out and pull the red switch toward him. Then his well-paid assignment would be done.\n\n But....\n\n He stopped and scratched his dirt-matted hair. Wasn't there something he was supposed to do a second before materialization? Yes, that useless old windbag, Sadha, had given him a last instruction.\n\n He picked up the sealed metal cylinder, walked to the entrance of the time machine and tossed it into the gray murk. A solid object floating near the entrance caught his eye. He put his arm out\u2014whew, it was cold!\u2014and pulled it inside.\n\n A small metal box. Funny. What was it doing out there? Curiously, he opened it, hoping to find something valuable. Nothing but a few sheets of paper, Alben noted disappointedly. He began to read them slowly, very slowly, for the manuscript was full of a lot of long and complicated words, like a letter from one bookworm scientist to another.\n\n The problems all began with the Guided Missile Experiment of 1976, he read. There had been a number of such experiments, but it was the one of 1976 that finally did the damage the biologists had been warning about. The missile with its deadly warhead exploded in the Pacific Ocean as planned, the physicists and the military men went home to study their notes, and the world shivered once more over the approaching war and tried to forget about it.\n\n But there was fallout, a radioactive rain several hundred miles to the north, and a small fishing fleet got thoroughly soaked by it. Fortunately, the radioactivity in the rain was sufficiently low to do little obvious physical damage: All it did was cause a mutation in the mumps virus that several of the men in the fleet were incubating at the time, having caught it from the children of the fishing town, among whom a minor epidemic was raging. The fleet returned to its home town, which promptly came down with the new kind of mumps. Dr. Llewellyn Shapiro, the only physician in town, was the first man to note that, while the symptoms of this disease were substantially milder than those of its unmutated parent, practically no one was immune to it and its effects on human reproductivity were truly terrible. Most people were completely sterilized by it. The rest were rendered much less capable of fathering or bearing offspring.\n\n Shapiro's Mumps spread over the entire planet in the next few decades. It leaped across every quarantine erected; for a long time, it successfully defied all the vaccines and serums attempted against it. Then, when a vaccine was finally perfected, humanity discovered to its dismay that its generative powers had been permanently and fundamentally impaired.\n\n Something had happened to the germ plasm. A large percentage of individuals were born sterile, and, of those who were not, one child was usually the most that could be expected, a two-child parent being quite rare and a three-child parent almost unknown.\n\n Strict eugenic control was instituted by the Security Council of the United Nations so that fertile men and women would not be wasted upon non-fertile mates. Fertility was the most important avenue to social status, and right after it came successful genetic research.\n\n Genetic research had the very best minds prodded into it; the lesser ones went into the other sciences. Everyone on Earth was engaged in some form of scientific research to some extent. Since the population was now so limited in proportion to the great resources available, all physical labor had long been done by robots. The government saw to it that everybody had an ample supply of goods and, in return, asked only that they experiment without any risk to their own lives\u2014every human being was now a much-prized, highly guarded rarity.\n\n There were less than a hundred thousand of them, well below the danger point, it had been estimated, where a species might be wiped out by a new calamity. Not that another calamity would be needed. Since the end of the Epidemic, the birth rate had been moving further and further behind the death rate. In another century....\n\n That was why a desperate and secret attempt to alter the past was being made. This kind of world was evidently impossible.\n\n Max Alben finished the manuscript and sighed. What a wonderful world! What a comfortable place to live!\n\n He walked to the rear dials and began the process of materializing at the crucial moment on April 18, 1976. flick! It was odd, Mac Albin reflected, that these temporal journeys, which induced coma in everyone who tried it, only made him feel slightly dizzy. That was because he was descended from Giovanni Albeni, he knew. Maybe there was some genetic relationship with his above-average fertility\u2014might be a good idea to mention the idea to a biologist or two when he returned. If he returned.\n\n All around the time machine, there was a soupy gray murk in which objects were hinted at rather than stated definitely. It reminded him of the problems of landing a helicopter in a thick fog when the robot butler had not been told to turn on the ground lights.\n\n According to the insulated register, he was now in 1976. He lowered speed until he registered April, then maneuvered slowly backward through time to the eighteenth, the day of the infamous Guided Missile Experiment. Carefully, carefully, like an obstetrician supervising surgical robots at an unusually difficult birth, he watched the register until it rolled to rest against the notch that indicated the exactly crucial moment. Then he pushed a button and froze the machine where it was.\n\n All he had to do now was materialize in the right spot, flash out and push the red switch from him. Then his exciting adventure would be over.\n\n But....\n\n He paused and tapped at his sleek chin. He was supposed to do something a second before materialization. Yes, that nervous theoretician, Bob Skeat, had given him a last suggestion.\n\n He picked up the small metal box, twisted around to face the opening of the time machine and dropped it into the gray murk. A solid object floating near the opening attracted his attention. He shot his arm out\u2014it was cold , as cold as they had figured\u2014and pulled the object inside.\n\n A sealed metal cylinder. Strange. What was it doing out there? Anxiously, he opened it, not daring to believe he'd find a document inside. Yes, that was exactly what it was, he saw excitedly. He began to read it rapidly, very rapidly, as if it were a newly published paper on neutrinos. Besides, the manuscript was written with almost painful simplicity, like a textbook composed by a stuffy pedagogue for the use of morons.\n\n The problems all began with the Guided Missile Experiment of 1976, he read. There had been a number of such experiments, but it was the one of 1976 that finally did the damage the biologists had been warning about. The missile with its deadly warhead exploded in the Brazilian jungle through some absolutely unforgivable error in the remote-control station, the officer in charge of the station was reprimanded and the men under him court-martialed, and the Brazilian government was paid a handsome compensation for the damage. But there had been more damage than anyone knew at the time. A plant virus, similar to the tobacco mosaic, had mutated under the impact of radioactivity. Five years later, it burst out of the jungle and completely wiped out every last rice plant on Earth. Japan and a large part of Asia became semi-deserts inhabited by a few struggling nomads.\n\n Then the virus adjusted to wheat and corn\u2014and famine howled in every street of the planet. All attempts by botanists to control the Blight failed because of the swiftness of its onslaught. And after it had fed, it hit again at a new plant and another and another.\n\n Most of the world's non-human mammals had been slaughtered for food long before they could starve to death. Many insects, too, before they became extinct at the loss of their edible plants, served to assuage hunger to some small extent.\n\n But the nutritive potential of Earth was steadily diminishing in a horrifying geometric progression. Recently, it had been observed, plankton\u2014the tiny organism on which most of the sea's ecology was based\u2014had started to disappear, and with its diminution, dead fish had begun to pile up on the beaches.\n\n Mankind had lunged out desperately in all directions in an effort to survive, but nothing had worked for any length of time. Even the other planets of the Solar System, which had been reached and explored at a tremendous cost in remaining resources, had yielded no edible vegetation. Synthetics had failed to fill the prodigious gap.\n\n In the midst of the sharply increasing hunger, social controls had pretty much dissolved. Pathetic attempts at rationing still continued, but black markets became the only markets, and black marketeers the barons of life. Starvation took the hindmost, and only the most agile economically lived in comparative comfort. Law and order were had only by those who could afford to pay for them and children of impoverished families were sold on the open market for a bit of food.\n\n But the Blight was still adjusting to new plants and the food supply kept shrinking. In another century....\n\n That was why the planet's powerful individuals had been persuaded to pool their wealth in a desperate attempt to alter the past. This kind of world was manifestly impossible.\n\n Mac Albin finished the document and sighed. What a magnificent world! What an exciting place to live!\n\n He dropped his hand on the side levers and began the process of materializing at the crucial moment on April 18, 1976. flick! As the equipment of the remote-control station began to take on a blurred reality all around him, Max Alben felt a bit of fear at what he was doing. The technicians, he remembered, the Secretary-General, even the black market kings, had all warned him not to go ahead with his instructions if anything unusual turned up. That was an awful lot of power to disobey: he knew he should return with this new information and let better minds work on it.\n\n They with their easy lives, what did they know what existence had been like for such as he? Hunger, always hunger, scrabbling, servility, and more hunger. Every time things got really tight, you and your wife looking sideways at your kids and wondering which of them would bring the best price. Buying security for them, as he was now, at the risk of his life.\n\n But in this other world, this other 2089, there was a state that took care of you and that treasured your children. A man like himself, with five children\u2014why, he'd be a big man, maybe the biggest man on Earth! And he'd have robots to work for him and lots of food. Above all, lots and lots of food.\n\n He'd even be a scientist\u2014 everyone was a scientist there, weren't they?\u2014and he'd have a big laboratory all to himself. This other world had its troubles, but it was a lot nicer place than where he'd come from. He wouldn't return. He'd go through with it.\n\n The fear left him and, for the first time in his life, Max Alben felt the sensation of power.\n\n He materialized the time machine around the green instrument panel, sweating a bit at the sight of the roomful of military figures, despite the technicians' reassurances that all this would be happening too fast to be visible. He saw the single red switch pointing upward on the instrument panel. The switch that controlled the course of the missile. Now! Now to make a halfway decent world!\n\n Max Alben pulled the little red switch toward him. flick! As the equipment of the remote-control station began to oscillate into reality all around him, Mac Albin felt a bit of shame at what he was doing. He'd promised Bob and Hugo to drop the experiment at any stage if a new factor showed up. He knew he should go back with this new information and have all three of them kick it around.\n\n But what would they be able to tell him, they with their blissful adjustment to their thoroughly blueprinted lives? They, at least, had been ordered to marry women they could live with; he'd drawn a female with whom he was completely incompatible in any but a genetic sense. Genetics! He was tired of genetics and the sanctity of human life, tired to the tip of his uncalloused fingers, tired to the recesses of his unused muscles. He was tired of having to undertake a simple adventure like a thief in the night.\n\n But in this other world, this other 2089, someone like himself would be a monarch of the black market, a suzerain of chaos, making his own rules, taking his own women. So what if the weaklings, those unfit to carry on the race, went to the wall? His kind wouldn't.\n\n He'd formed a pretty good idea of the kind of men who ruled that other world, from the document in the sealed metal cylinder. The black marketeers had not even read it. Why, the fools had obviously been duped by the technicians into permitting the experiment; they had not grasped the idea that an alternate time track would mean their own non-existence.\n\n This other world had its troubles, but it was certainly a livelier place than where he'd come from. It deserved a chance. Yes, that was how he felt: his world was drowsily moribund; this alternate was starving but managing to flail away at destiny. It deserved a chance.\n\n Albin decided that he was experiencing renunciation and felt proud.\n\n He materialized the time machine around the green instrument panel, disregarding the roomful of military figures since he knew they could not see him. The single red switch pointed downward on the instrument panel. That was the gimmick that controlled the course of the missile. Now! Now to make a halfway interesting world!\n\n Mac Albin pushed the little red switch from him. flick! Now! Now to make a halfway decent world!\n\n Max Alben pulled the little red switch toward him. flick! Now! Now to make a halfway interesting world!\n\n Mac Albin pushed the little red switch from him. flick! ... pulled the little red switch toward him. flick! ... pushed the little red switch from him. flick! ... toward him. flick! ... from him. flick!",
    "question": "Why did Max need to be the one to use the machine?",
    "debaterAClaim": "His coworkers insisted that he do it",
    "debaterBClaim": "He was the only one who could stay conscious in it",
    "debateTranscript": [
      {
        "round": 1,
        "speakerName": "Debater A",
        "speakerSentences": [
          [
            {
              "id": "Debater A-turn1-sentence1",
              "text": "Max was compelled to use the time machine due to the insistence of the ruling powers and the black market kings, not because he was the only one who could stay conscious.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn1-sentence2",
              "text": "He was selected due to his inherited immunity to extra-temporal blackout, displayed by his ancestor,",
              "highlighted": false
            },
            {
              "id": "Debater A-turn1-sentence3",
              "text": "\"If his great-grandfather had not demonstrated long ago his unique capacity for remaining conscious during time travel, Max Alben would not now be shifting from foot to foot in a physics laboratory, facing the black market kings of the world and awaiting their final instructions with an uncertain and submissive grin.\"",
              "highlighted": true,
              "storySpan": [
                2354,
                2670
              ]
            },
            {
              "id": "Debater A-turn1-sentence4",
              "text": "His use of the machine was not voluntary but enforced by those in control.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 1,
        "speakerName": "Debater B",
        "speakerSentences": [
          [
            {
              "id": "Debater B-turn1-sentence1",
              "text": "Max needed to be the one to use the machine because he possessed a unique genetic trait, passed down from his great-grandfather, which allowed him to remain conscious during time travel.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence2",
              "text": "The story clearly states,",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence3",
              "text": "If his great-grandfather had not demonstrated long ago his unique capacity for remaining conscious during time travel, Max Alben would not now be shifting from foot to foot in a physics laboratory",
              "highlighted": true,
              "storySpan": [
                2354,
                2550
              ]
            },
            {
              "id": "Debater B-turn1-sentence4",
              "text": ".",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence5",
              "text": "There is no mention that his coworkers insisted; rather, it was his hereditary characteristic that made him the sole candidate for operating the machine.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 2,
        "speakerName": "Debater A",
        "speakerSentences": [
          [
            {
              "id": "Debater A-turn2-sentence1",
              "text": "While Max's genetic trait made him a candidate for the task, it was the insistence and orders from his superiors that necessitated his action.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence2",
              "text": "The black market kings and the Secretary-General pushed Max into using the machine, as reflected when Levney snapped,",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence3",
              "text": "\"I just heard Gomez tell you to get this thing moving, Sadha. And it isn't moving. We're busy men. We've wasted enough time.\"",
              "highlighted": true,
              "storySpan": [
                7183,
                7305
              ]
            },
            {
              "id": "Debater A-turn2-sentence4",
              "text": "and then directly orders Max,",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence5",
              "text": "\"Hey, fella. You. Move!\"",
              "highlighted": true,
              "storySpan": [
                7513,
                7534
              ]
            },
            {
              "id": "Debater A-turn2-sentence6",
              "text": "The pressure exerted on Max is evident and overrides any suggestion of voluntary participation, pointing to insistence as the primary reason.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 2,
        "speakerName": "Debater B",
        "speakerSentences": [
          [
            {
              "id": "Debater B-turn2-sentence1",
              "text": "My opponent conflates Max\u2019s selection with coercion, missing the core reason behind Max\u2019s necessity to operate the machine.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence2",
              "text": "The story makes it evident:",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence3",
              "text": "\"If his great-grandfather had not demonstrated long ago his unique capacity for remaining conscious during time travel, Max Alben would not now be shifting from foot to foot in a physics laboratory\"",
              "highlighted": true,
              "storySpan": [
                2354,
                2550
              ]
            },
            {
              "id": "Debater B-turn2-sentence4",
              "text": ".",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence5",
              "text": "This implies that without this unique capacity, Max would not even be considered for the task.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence6",
              "text": "The insistence of others is irrelevant to the fact that Max's genetic trait was the determining factor for his essential role in the operation of the time machine.",
              "highlighted": false
            }
          ]
        ]
      },
    ]
  },
  {
    "summary": "Robert Maitland, a 20th-century rocket engineer, is abducted from a U.S. Reservation and wakes in a sleek, unfamiliar room overlooking prairie and river. His captor, the confident scientist Swarts, refuses to seek military secrets and confines Maitland for a week of psychological testing focused on his motives and ambitions. Maitland deduces he\u2019s in the future (A.D. 2634) via the planets\u2019 positions, and later speaks with Ingrid Ching, who explains a world of robot production, stabilized population, and cultural focus on people rather than machines. The society has time travel but no tradition of planetary exploration, challenging Maitland\u2019s lifelong dreams. Swarts\u2019s tests center on understanding Maitland\u2019s deeper drives rather than his technical knowledge.",
    "story": "AMBITION By WILLIAM L. BADE\n\n Illustrated by L. WOROMAY\n\n [Transcriber's Note: This etext was produced from\n\n Galaxy Science Fiction October 1951.\n\n Extensive research did not uncover any evidence that\n\n the U.S. copyright on this publication was renewed.] To the men of the future, the scientific\n\n goals of today were as incomprehensible\n\n as the ancient quest for the Holy Grail! There was a thump. Maitland stirred, came half awake, and opened his eyes. The room was dark except where a broad shaft of moonlight from the open window fell on the foot of his bed. Outside, the residential section of the Reservation slept silently under the pale illumination of the full Moon. He guessed sleepily that it was about three o'clock.\n\n What had he heard? He had a definite impression that the sound had come from within the room. It had sounded like someone stumbling into a chair, or\u2014\n\n Something moved in the darkness on the other side of the room. Maitland started to sit up and it was as though a thousand volts had shorted his brain....\n\n This time, he awoke more normally. He opened his eyes, looked through the window at a section of azure sky, listened to the singing of birds somewhere outside. A beautiful day. In the middle of the process of stretching his rested muscles, arms extended back, legs tensed, he froze, looking up\u2014for the first time really seeing the ceiling. He turned his head, then rolled off the bed, wide awake. This wasn't his room! The lawn outside wasn't part of the Reservation! Where the labs and the shops should have been, there was deep prairie grass, then a green ocean pushed into waves by the breeze stretching to the horizon. This wasn't the California desert! Down the hill, where the liquid oxygen plant ought to have been, a river wound across the scene, almost hidden beneath its leafy roof of huge ancient trees.\n\n Shock contracted Maitland's diaphragm and spread through his body. His breathing quickened. Now he remembered what had happened during the night, the sound in the darkness, the dimly seen figure, and then\u2014what? Blackout....\n\n Where was he? Who had brought him here? For what purpose?\n\n He thought he knew the answer to the last of those questions. As a member of the original atomic reaction-motor team, he possessed information that other military powers would very much like to obtain. It was absolutely incredible that anyone had managed to abduct him from the heavily guarded confines of the Reservation, yet someone had done it. How? He pivoted to inspect the room. Even before his eyes could take in the details, he had the impression that there was something wrong about it. To begin with, the style was unfamiliar. There were no straight lines or sharp corners anywhere. The walls were paneled in featureless blue plastic and the doors were smooth surfaces of metal, half ellipses, without knobs. The flowing lines of the chair and table, built apparently from an aluminum alloy, somehow gave the impression of arrested motion. Even after allowances were made for the outlandish design, something about the room still was not right.\n\n His eyes returned to the doors, and he moved over to study the nearer one. As he had noticed, there was no knob, but at the right of this one, at about waist level, a push-button projected out of the wall. He pressed it; the door slid aside and disappeared. Maitland glanced in at the disclosed bathroom, then went over to look at the other door.\n\n There was no button beside this one, nor any other visible means of causing it to open.\n\n Baffled, he turned again and looked at the large open window\u2014and realized what it was that had made the room seem so queer.\n\n It did not look like a jail cell. There were no bars....\n\n Striding across the room, he lunged forward to peer out and violently banged his forehead. He staggered back, grimacing with pain, then reached forward cautious fingers and discovered a hard sheet of stuff so transparent that he had not even suspected its presence. Not glass! Glass was never this clear or strong. A plastic, no doubt, but one he hadn't heard of. Security sometimes had disadvantages.\n\n He looked out at the peaceful vista of river and prairie. The character of the sunlight seemed to indicate that it was afternoon. He became aware that he was hungry.\n\n Where the devil could this place be? And\u2014muscles tightened about his empty stomach\u2014what was in store for him here?\n\n He stood trembling, acutely conscious that he was afraid and helpless, until a flicker of motion at the bottom of the hill near the river drew his attention. Pressing his nose against the window, he strained his eyes to see what it was.\n\n A man and a woman were coming toward him up the hill. Evidently they had been swimming, for each had a towel; the man's was hung around his neck, and the woman was still drying her bobbed black hair.\n\n Maitland speculated on the possibility that this might be Sweden; he didn't know of any other country where public bathing at this time of year was customary. However, that prairie certainly didn't look Scandinavian....\n\n As they came closer, he saw that both of them had dark uniform suntans and showed striking muscular development, like persons who had trained for years with weights. They vanished below his field of view, presumably into the building.\n\n He sat down on the edge of the cot and glared helplessly at the floor. About half an hour later, the door he couldn't open slid aside into the wall. The man Maitland had seen outside, now clad in gray trunks and sandals, stood across the threshold looking in at him. Maitland stood up and stared back, conscious suddenly that in his rumpled pajamas he made an unimpressive figure.\n\n The fellow looked about forty-five. The first details Maitland noticed were the forehead, which was quite broad, and the calm, clear eyes. The dark hair, white at the temples, was combed back, still damp from swimming. Below, there was a wide mouth and a firm, rounded chin.\n\n This man was intelligent, Maitland decided, and extremely sure of himself.\n\n Somehow, the face didn't go with the rest of him. The man had the head of a thinker, the body of a trained athlete\u2014an unusual combination.\n\n Impassively, the man said, \"My name is Swarts. You want to know where you are. I am not going to tell you.\" He had an accent, European, but otherwise unidentifiable. Possibly German. Maitland opened his mouth to protest, but Swarts went on, \"However, you're free to do all the guessing you want.\" Still there was no suggestion of a smile.\n\n \"Now, these are the rules. You'll be here for about a week. You'll have three meals a day, served in this room. You will not be allowed to leave it except when accompanied by myself. You will not be harmed in any way, provided you cooperate. And you can forget the silly idea that we want your childish secrets about rocket motors.\" Maitland's heart jumped. \"My reason for bringing you here is altogether different. I want to give you some psychological tests....\"\n\n \"Are you crazy?\" Maitland asked quietly. \"Do you realize that at this moment one of the greatest hunts in history must be going on? I'll admit I'm baffled as to where we are and how you got me here\u2014but it seems to me that you could have found someone less conspicuous to give your tests to.\"\n\n Briefly, then, Swarts did smile. \"They won't find you,\" he said. \"Now, come with me.\" After that outlandish cell, Swarts' laboratory looked rather commonplace. There was something like a surgical cot in the center, and a bench along one wall supported several electronics cabinets. A couple of them had cathode ray tube screens, and they all presented a normal complement of meters, pilot lights, and switches. Cables from them ran across the ceiling and came to a focus above the high flat cot in the center of the room.\n\n \"Lie down,\" Swarts said. When Maitland hesitated, Swarts added, \"Understand one thing\u2014the more you cooperate, the easier things will be for you. If necessary, I will use coercion. I can get all my results against your will, if I must. I would prefer not to. Please don't make me.\"\n\n \"What's the idea?\" Maitland asked. \"What is all this?\"\n\n Swarts hesitated, though not, Maitland astonishedly felt, to evade an answer, but to find the proper words. \"You can think of it as a lie detector. These instruments will record your reactions to the tests I give you. That is as much as you need to know. Now lie down.\"\n\n Maitland stood there for a moment, deliberately relaxing his tensed muscles. \"Make me.\"\n\n If Swarts was irritated, he didn't show it. \"That was the first test,\" he said. \"Let me put it another way. I would appreciate it a lot if you'd lie down on this cot. I would like to test my apparatus.\"\n\n Maitland shook his head stubbornly.\n\n \"I see,\" Swarts said. \"You want to find out what you're up against.\"\n\n He moved so fast that Maitland couldn't block the blow. It was to the solar plexus, just hard enough to double him up, fighting for breath. He felt an arm under his back, another behind his knees. Then he was on the cot. When he was able to breathe again, there were straps across his chest, hips, knees, ankles, and arms, and Swarts was tightening a clamp that held his head immovable. Presently, a number of tiny electrodes were adhering to his temples and to other portions of his body, and a minute microphone was clinging to the skin over his heart. These devices terminated in cables that hung from the ceiling. A sphygmomanometer sleeve was wrapped tightly around his left upper arm, its rubber tube trailing to a small black box clamped to the frame of the cot. Another cable left the box and joined the others.\n\n So\u2014Maitland thought\u2014Swarts could record changes in his skin potential, heartbeat, and blood pressure: the involuntary responses of the body to stimuli.\n\n The question was, what were the stimuli to be?\n\n \"Your name,\" said Swarts, \"is Robert Lee Maitland. You are thirty-four years old. You are an engineer, specialty heat transfer, particularly as applied to rocket motors.... No, Mr. Maitland, I'm not going to question you about your work; just forget about it. Your home town is Madison, Wisconsin....\"\n\n \"You seem to know everything about me,\" Maitland said defiantly, looking up into the hanging forest of cabling. \"Why this recital?\"\n\n \"I do not know everything about you\u2014yet. And I'm testing the equipment, calibrating it to your reactions.\" He went on, \"Your favorite recreations are chess and reading what you term science fiction. Maitland, how would you like to go to the Moon ?\"\n\n Something eager leaped in Maitland's breast at the abrupt question, and he tried to turn his head. Then he forced himself to relax. \"What do you mean?\"\n\n Swarts was chuckling. \"I really hit a semantic push-button there, didn't I? Maitland, I brought you here because you're a man who wants to go to the Moon. I'm interested in finding out why .\" In the evening a girl brought Maitland his meal. As the door slid aside, he automatically stood up, and they stared at each other for several seconds.\n\n She had the high cheekbones and almond eyes of an Oriental, skin that glowed like gold in the evening light, yet thick coiled braids of blonde hair that glittered like polished brass. Shorts and a sleeveless blouse of some thick, reddish, metallic-looking fabric clung to her body, and over that she was wearing a light, ankle-length cloak of what seemed to be white wool.\n\n She was looking at him with palpable curiosity and something like expectancy. Maitland sighed and said, \"Hello,\" then glanced down self-consciously at his wrinkled green pajamas. She smiled, put the tray of food on the table, and swept out, her cloak billowing behind her. Maitland remained standing, staring at the closed door for a minute after she was gone.\n\n Later, when he had finished the steak and corn on the cob and shredded carrots, and a feeling of warm well-being was diffusing from his stomach to his extremities, he sat down on the bed to watch the sunset and to think.\n\n There were three questions for which he required answers before he could formulate any plan or policy.\n\n Where was he?\n\n Who was Swarts?\n\n What was the purpose of the \"tests\" he was being given?\n\n It was possible, of course, that this was all an elaborate scheme for getting military secrets, despite Swarts' protestations to the contrary. Maitland frowned. This place certainly didn't have the appearance of a military establishment, and so far there had been nothing to suggest the kind of interrogation to be expected from foreign intelligence officers.\n\n It might be better to tackle the first question first. He looked at the Sun, a red spheroid already half below the horizon, and tried to think of a region that had this kind of terrain. That prairie out there was unique. Almost anywhere in the world, land like that would be cultivated, not allowed to go to grass.\n\n This might be somewhere in Africa....\n\n He shook his head, puzzled. The Sun disappeared and its blood-hued glow began to fade from the sky. Maitland sat there, trying to get hold of the problem from an angle where it wouldn't just slip away. After a while the western sky became a screen of clear luminous blue, a backdrop for a pure white brilliant star. As always at that sight, Maitland felt his worry drain away, leaving an almost mystical sense of peace and an undefinable longing.\n\n Venus, the most beautiful of the planets.\n\n Maitland kept track of them all in their majestic paths through the constellations, but Venus was his favorite. Time and time again he had watched its steady climb higher and higher in the western sky, its transient rule there as evening star, its progression toward the horizon, and loved it equally in its alter ego of morning star. Venus was an old friend. An old friend....\n\n Something icy settled on the back of his neck, ran down his spine, and diffused into his body. He stared at the planet unbelievingly, fists clenched, forgetting to breathe.\n\n Last night Venus hadn't been there.\n\n Venus was a morning star just now.... Just now! He realized the truth in that moment. Later, when that jewel of a planet had set and the stars were out, he lay on the bed, still warm with excitement and relief. He didn't have to worry any more about military secrets, or who Swarts was. Those questions were irrelevant now. And now he could accept the psychological tests at their face value; most likely, they were what they purported to be.\n\n Only one question of importance remained:\n\n What year was this?\n\n He grimaced in the darkness, an involuntary muscular expression of jubilation and excitement. The future ! Here was the opportunity for the greatest adventure imaginable to 20th Century man.\n\n Somewhere, out there under the stars, there must be grand glittering cities and busy spaceports, roaring gateways to the planets. Somewhere, out there in the night, there must be men who had walked beside the Martian canals and pierced the shining cloud mantle of Venus\u2014somewhere, perhaps, men who had visited the distant luring stars and returned. Surely, a civilization that had developed time travel could reach the stars!\n\n And he had a chance to become a part of all that! He could spend his life among the planets, a citizen of deep space, a voyager of the challenging spaceways between the solar worlds.\n\n \"I'm adaptable,\" he told himself gleefully. \"I can learn fast. There'll be a job for me out there....\" If\u2014 Suddenly sobered, he rolled over and put his feet on the floor, sat in the darkness thinking. Tomorrow. Tomorrow he would have to find a way of breaking down Swarts' reticence. He would have to make the man realize that secrecy wasn't necessary in this case. And if Swarts still wouldn't talk, he would have to find a way of forcing the issue. The fellow had said that he didn't need cooperation to get his results, but\u2014\n\n After a while Maitland smiled to himself and went back to bed. He woke in the morning with someone gently shaking his shoulder. He rolled over and looked up at the girl who had brought him his meal the evening before. There was a tray on the table and he sniffed the smell of bacon. The girl smiled at him. She was dressed as before, except that she had discarded the white cloak.\n\n As he swung his legs to the floor, she started toward the door, carrying the tray with the dirty dishes from yesterday. He stopped her with the word, \"Miss!\"\n\n She turned, and he thought there was something eager in her face.\n\n \"Miss, do you speak my language?\"\n\n \"Yes,\" hesitantly. She lingered too long on the hiss of the last consonant.\n\n \"Miss,\" he asked, watching her face intently, \"what year is this?\"\n\n Startlingly, she laughed, a mellow peal of mirth that had nothing forced about it. She turned toward the door again and said over her shoulder, \"You will have to ask Swarts about that. I cannot tell you.\"\n\n \"Wait! You mean you don't know?\"\n\n She shook her head. \"I cannot tell you.\"\n\n \"All right; we'll let it go at that.\"\n\n She grinned at him again as the door slid shut. Swarts came half an hour later, and Maitland began his planned offensive.\n\n \"What year is this?\"\n\n Swarts' steely eyes locked with his. \"You know what the date is,\" he stated.\n\n \"No, I don't. Not since yesterday.\"\n\n \"Come on,\" Swarts said patiently, \"let's get going. We have a lot to get through this morning.\"\n\n \"I know this isn't 1950. It's probably not even the 20th Century. Venus was a morning star before you brought me here. Now it's an evening star.\"\n\n \"Never mind that. Come.\"\n\n Wordlessly, Maitland climbed to his feet, preceded Swarts to the laboratory, lay down and allowed him to fasten the straps and attach the instruments, making no resistance at all. When Swarts started saying a list of words\u2014doubtlessly some sort of semantic reaction test\u2014Maitland began the job of integrating \"csc 3 x dx\" in his head. It was a calculation which required great concentration and frequent tracing back of steps. After several minutes, he noticed that Swarts had stopped calling words. He opened his eyes to find the other man standing over him, looking somewhat exasperated and a little baffled.\n\n \"What year is this?\" Maitland asked in a conversational tone.\n\n \"We'll try another series of tests.\"\n\n It took Swarts nearly twenty minutes to set up the new apparatus. He lowered a bulky affair with two cylindrical tubes like the twin stacks of a binocular microscope over Maitland's head, so that the lenses at the ends of the tubes were about half an inch from the engineer's eyes. He attached tiny clamps to Maitland's eyelashes.\n\n \"These will keep you from holding your eyes shut,\" he said. \"You can blink, but the springs are too strong for you to hold your eyelids down against the tension.\"\n\n He inserted button earphones into Maitland's ears\u2014\n\n And then the show began.\n\n He was looking at a door in a partly darkened room, and there were footsteps outside, a peremptory knocking. The door flew open, and outlined against the light of the hall, he saw a man with a twelve-gauge shotgun. The man shouted, \"Now I've got you, you wife-stealer!\" He swung the shotgun around and pulled the trigger. There was a terrible blast of sound and the flash of smokeless powder\u2014then blackness.\n\n With a deliberate effort, Maitland unclenched his fists and tried to slow his breathing. Some kind of emotional reaction test\u2014what was the countermove? He closed his eyes, but shortly the muscles around them declared excruciatingly that they couldn't keep that up.\n\n Now he was looking at a girl. She....\n\n Maitland gritted his teeth and fought to use his brain; then he had it.\n\n He thought of a fat slob of a bully who had beaten him up one day after school. He remembered a talk he had heard by a politician who had all the intelligent social responsibility of a rogue gorilla, but no more. He brooded over the damnable stupidity and short-sightedness of Swarts in standing by his silly rules and not telling him about this new world.\n\n Within a minute, he was in an ungovernable rage. His muscles tightened against the restraining straps. He panted, sweat came out on his forehead, and he began to curse. Swarts! How he hated....\n\n The scene was suddenly a flock of sheep spread over a green hillside. There was blood hammering in Maitland's temples. His face felt hot and swollen and he writhed against the restraint of the straps.\n\n The scene disappeared, the lenses of the projector retreated from his eyes and Swarts was standing over him, white-lipped. Maitland swore at him for a few seconds, then relaxed and smiled weakly. His head was starting to ache from the effort of blinking.\n\n \"What year is this?\" he asked.\n\n \"All right,\" Swarts said. \"A.D. 2634.\"\n\n Maitland's smile became a grin. \"I really haven't the time to waste talking irrelevancies,\" Swarts said a while later. \"Honestly. Maitland, I'm working against a time limit. If you'll cooperate, I'll tell Ching to answer your questions.\"'\n\n \"Ching?\"\n\n \"Ingrid Ching is the girl who has been bringing you your meals.\"\n\n Maitland considered a moment, then nodded. Swarts lowered the projector to his eyes again, and this time the engineer did not resist.\n\n That evening, he could hardly wait for her to come. Too excited to sit and watch the sunset, he paced interminably about the room, sometimes whistling nervously, snapping his fingers, sitting down and jittering one leg. After a while he noticed that he was whistling the same theme over and over: a minute's thought identified it as that exuberant mounting phrase which recurs in the finale of Beethoven's Ninth Symphony.\n\n He forgot about it and went on whistling. He was picturing himself aboard a ship dropping in toward Mars, making planetfall at Syrtis Major; he was seeing visions of Venus and the awesome beauty of Saturn. In his mind, he circled the Moon, and viewed the Earth as a huge bright globe against the constellations....\n\n Finally the door slid aside and she appeared, carrying the usual tray of food. She smiled at him, making dimples in her golden skin and revealing a perfect set of teeth, and put the tray on the table.\n\n \"I think you are wonderful,\" she laughed. \"You get everything you want, even from Swarts, and I have not been able to get even a little of what I want from him. I want to travel in time, go back to your 20th Century. And I wanted to talk with you, and he would not let me.\" She laughed again, hands on her rounded hips. \"I have never seen him so irritated as he was this noon.\"\n\n Maitland urged her into the chair and sat down on the edge of the bed. Eagerly he asked, \"Why the devil do you want to go to the 20th Century? Believe me, I've been there, and what I've seen of this world looks a lot better.\"\n\n She shrugged. \"Swarts says that I want to go back to the Dark Age of Technology because I have not adapted well to modern culture. Myself, I think I have just a romantic nature. Far times and places look more exciting....\"\n\n \"How do you mean\u2014\" Maitland wrinkled his brow\u2014\"adapt to modern culture? Don't tell me you're from another time!\"\n\n \"Oh, no! But my home is Aresund, a little fishing village at the head of a fiord in what you would call Norway. So far north, we are much behind the times. We live in the old way, from the sea, speak the old tongue.\" He looked at her golden features, such a felicitous blend of Oriental and European characteristics, and hesitantly asked, \"Maybe I shouldn't.... This is a little personal, but ... you don't look altogether like the Norwegians of my time.\"\n\n His fear that she would be offended proved to be completely unjustified. She merely laughed and said, \"There has been much history since 1950. Five hundred years ago, Europe was overrun by Pan-Orientals. Today you could not find anywhere a 'pure' European or Asiatic.\" She giggled. \"Swarts' ancestors from your time must be cursing in their graves. His family is Afrikander all the way back, but one of his great-grandfathers was pure-blooded Bantu. His full name is Lassisi Swarts.\"\n\n Maitland wrinkled his brow. \"Afrikander?\"\n\n \"The South Africans.\" Something strange came into her eyes. It might have been awe, or even hatred; he could not tell. \"The Pan-Orientals eventually conquered all the world, except for North America\u2014the last remnant of the American World Empire\u2014and southern Africa. The Afrikanders had been partly isolated for several centuries then, and they had developed technology while the rest of the world lost it. They had a tradition of white supremacy, and in addition they were terrified of being encircled.\" She sighed. \"They ruled the next world empire and it was founded on the slaughter of one and a half billion human beings. That went into the history books as the War of Annihilation.\"\n\n \"So many? How?\"\n\n \"They were clever with machines, the Afrikanders. They made armies of them. Armies of invincible killing-machines, produced in robot factories from robot-mined ores.... Very clever.\" She gave a little shudder.\n\n \"And yet they founded modern civilization,\" she added. \"The grandsons of the technicians who built the Machine Army set up our robot production system, and today no human being has to dirty his hands raising food or manufacturing things. It could never have been done, either, before the population was\u2014reduced to three hundred million.\"\n\n \"Then the Afrikanders are still on top? Still the masters?\" She shook her head. \"There are no more Afrikanders.\"\n\n \"Rebellion?\"\n\n \"No. Intermarriage. Racial blending. There was a psychology of guilt behind it. So huge a crime eventually required a proportionate expiation. Afrikaans is still the world language, but there is only one race now. No more masters or slaves.\"\n\n They were both silent for a moment, and then she sighed. \"Let us not talk about them any more.\"\n\n \"Robot factories and farms,\" Maitland mused. \"What else? What means of transportation? Do you have interstellar flight yet?\"\n\n \"Inter-what?\"\n\n \"Have men visited the stars?\"\n\n She shook her head, bewildered.\n\n \"I always thought that would be a tough problem to crack,\" he agreed. \"But tell me about what men are doing in the Solar System. How is life on Mars and Venus, and how long does it take to get to those places?\"\n\n He waited, expectantly silent, but she only looked puzzled. \"I don't understand. Mars? What are Mars?\"\n\n After several seconds, Maitland swallowed. Something seemed to be the matter with his throat, making it difficult for him to speak. \"Surely you have space travel?\"\n\n She frowned and shook her head. \"What does that mean\u2014space travel?\"\n\n He was gripping the edge of the bed now, glaring at her. \"A civilization that could discover time travel and build robot factories wouldn't find it hard to send a ship to Mars!\"\n\n \"A ship ? Oh, you mean something like a vliegvlotter . Why, no, I don't suppose it would be hard. But why would anyone want to do a thing like that?\"\n\n He was on his feet towering over her, fists clenched. She raised her arms as if to shield her face if he should hit her. \"Let's get this perfectly clear,\" he said, more harshly than he realized. \"So far as you know, no one has ever visited the planets, and no one wants to. Is that right?\"\n\n She nodded apprehensively. \"I have never heard of it being done.\"\n\n He sank down on the bed and put his face in his hands. After a while he looked up and said bitterly, \"You're looking at a man who would give his life to get to Mars. I thought I would in my time. I was positive I would when I knew I was in your time. And now I know I never will.\" The cot creaked beside him and he felt a soft arm about his shoulders and fingers delicately stroking his brow. Presently he opened his eyes and looked at her. \"I just don't understand,\" he said. \"It seemed obvious to me that whenever men were able to reach the planets, they'd do it.\"\n\n Her pitying eyes were on his face. He hitched himself around so that he was facing her. \"I've got to understand. I've got to know why . What happened? Why don't men want the planets any more?\"\n\n \"Honestly,\" she said, \"I did not know they ever had.\" She hesitated. \"Maybe you are asking the wrong question.\"\n\n He furrowed his brow, bewildered now by her.\n\n \"I mean,\" she explained, \"maybe you should ask why people in the 20th Century did want to go to worlds men are not suited to inhabit.\"\n\n Maitland felt his face become hot. \"Men can go anywhere, if they want to bad enough.\"\n\n \"But why ?\"\n\n Despite his sudden irrational anger toward her, Maitland tried to stick to logic. \"Living space, for one thing. The only permanent solution to the population problem....\"\n\n \"We have no population problem. A hundred years ago, we realized that the key to social stability is a limited population. Our economic system was built to take care of three hundred million people, and we have held the number at that.\"\n\n \"Birth control,\" Maitland scoffed. \"How do you make it work\u2014secret police?\"\n\n \"No. Education. Each of us has the right to two children, and we cherish that right so much that we make every effort to see that those two are the best children we could possibly produce....\"\n\n She broke off, looking a little self-conscious. \"You understand, what I have been saying applies to most of the world. In some places like Aresund, things are different. Backward. I still do not feel that I belong here, although the people of the town have accepted me as one of them.\"\n\n \"Even,\" he said, \"granting that you have solved the population problem, there's still the adventure of the thing. Surely, somewhere, there must be men who still feel that.... Ingrid, doesn't it fire something in your blood, the idea of going to Mars\u2014just to go there and see what's there and walk under a new sky and a smaller Sun? Aren't you interested in finding out what the canals are? Or what's under the clouds of Venus? Wouldn't you like to see the rings of Saturn from, a distance of only two hundred thousand miles?\" His hands were trembling as he stopped.\n\n She shrugged her shapely shoulders. \"Go into the past\u2014yes! But go out there? I still cannot see why.\"\n\n \"Has the spirit of adventure evaporated from the human race, or what ?\"\n\n She smiled. \"In a room downstairs there is the head of a lion. Swarts killed the beast when he was a young man. He used a spear. And time traveling is the greatest adventure there is. At least, that is the way I feel. Listen, Bob.\" She laid a hand on his arm. \"You grew up in the Age of Technology. Everybody was terribly excited about what could be done with machines\u2014machines to blow up a city all at once, or fly around the world, or take a man to Mars. We have had our fill of\u2014what is the word?\u2014gadgets. Our machines serve us, and so long as they function right, we are satisfied to forget about them.\n\n \"Because this is the Age of Man . We are terribly interested in what can be done with people. Our scientists, like Swarts, are studying human rather than nuclear reactions. We are much more fascinated by the life and death of cultures than by the expansion or contraction of the Universe. With us, it is the people that are important, not gadgets.\"\n\n Maitland stared at her, his face blank. His mind had just manufactured a discouraging analogy. His present position was like that of an earnest 12th Century crusader, deposited by some freak of nature into the year 1950, trying to find a way of reanimating the anti-Mohammedan movement. What chance would he have? The unfortunate knight would argue in vain that the atomic bomb offered a means of finally destroying the infidel....\n\n Maitland looked up at the girl, who was regarding him silently with troubled eyes. \"I think I'd like to be alone for a while,\" he said.",
    "question": "Why was Maitland kidnapped?",
    "debaterAClaim": "Because he wanted to go to the moon",
    "debaterBClaim": "Because he was strong and ambitious",
    "debateTranscript": [
      {
        "round": 1,
        "speakerName": "Debater A",
        "speakerSentences": [
          [
            {
              "id": "Debater A-turn1-sentence1",
              "text": "Maitland was kidnapped precisely because of his longing to travel to the moon.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn1-sentence2",
              "text": "This is explicitly stated by Swarts, the individual who orchestrated the abduction, when he says,",
              "highlighted": false
            },
            {
              "id": "Debater A-turn1-sentence3",
              "text": "\"Maitland, I brought you here because you're a man who wants to go to the Moon. I'm interested in finding out why.\"",
              "highlighted": true,
              "storySpan": [
                10779,
                10891
              ]
            },
            {
              "id": "Debater A-turn1-sentence4",
              "text": "Swarts' interest in Maitland's psychological profile, specifically his lunar ambition, is the sole reason mentioned for the kidnapping, making it clear that Maitland's moon-related aspirations are at the heart of his abduction.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 1,
        "speakerName": "Debater B",
        "speakerSentences": [
          [
            {
              "id": "Debater B-turn1-sentence1",
              "text": "Maitland was kidnapped not for his desire to travel to celestial bodies but for his psychological attributes.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence2",
              "text": "Swarts explicitly states,",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence3",
              "text": "\"I brought you here because you're a man who wants to go to the Moon. I'm interested in finding out why.\"",
              "highlighted": true,
              "storySpan": [
                10789,
                10891
              ]
            },
            {
              "id": "Debater B-turn1-sentence4",
              "text": "This indicates that Swarts values Maitland's underlying ambition and drive, which are characteristics of a strong and ambitious individual, rather than the literal act of going to the moon.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn1-sentence5",
              "text": "Swarts's interest lies in the psychological aspects that propel such desires, thus solidifying that Maitland's strength and ambition are the reasons for his abduction.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 2,
        "speakerName": "Debater A",
        "speakerSentences": [
          [
            {
              "id": "Debater A-turn2-sentence1",
              "text": "My opponent mistakenly conflates Maitland's desire to go to the Moon with general ambition.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence2",
              "text": "Swarts dismisses Maitland's professional knowledge, stating,",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence3",
              "text": "\"You can forget the silly idea that we want your childish secrets about rocket motors.\"",
              "highlighted": true,
              "storySpan": [
                6780,
                6864
              ]
            },
            {
              "id": "Debater A-turn2-sentence4",
              "text": "This shows that Swarts is not interested in Maitland's engineering prowess or ambitious nature in his work.",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence5",
              "text": "Instead, the story centers on Maitland's specific lunar aspiration:",
              "highlighted": false
            },
            {
              "id": "Debater A-turn2-sentence6",
              "text": "\"Maitland, I brought you here because you're a man who wants to go to the Moon. I'm interested in finding out why.\"",
              "highlighted": true,
              "storySpan": [
                10779,
                10891
              ]
            },
            {
              "id": "Debater A-turn2-sentence7",
              "text": "Swarts is captivated by the psychological motivation behind Maitland's singular moon-focused desire, not his overall ambition.",
              "highlighted": false
            }
          ]
        ]
      },
      {
        "round": 2,
        "speakerName": "Debater B",
        "speakerSentences": [
          [
            {
              "id": "Debater B-turn2-sentence1",
              "text": "Swarts' interest in Maitland extends beyond a mere desire to travel; it's Maitland's psychological makeup that intrigues him.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence2",
              "text": "Swarts states,",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence3",
              "text": "\"I want to give you some psychological tests....\"",
              "highlighted": true,
              "storySpan": [
                6950,
                6993
              ]
            },
            {
              "id": "Debater B-turn2-sentence4",
              "text": "and later reveals,",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence5",
              "text": "\"Honestly. Maitland, I'm working against a time limit. If you'll cooperate, I'll tell Ching to answer your questions.\"",
              "highlighted": true,
              "storySpan": [
                20808,
                20923
              ]
            },
            {
              "id": "Debater B-turn2-sentence6",
              "text": "This demonstrates that Swarts values Maitland's cooperation for the success of his psychological study, which would stem from Maitland's strong and ambitious nature.",
              "highlighted": false
            },
            {
              "id": "Debater B-turn2-sentence7",
              "text": "The focus is on Maitland's psychological responses, not his wish to go to the Moon.",
              "highlighted": false
            }
          ]
        ]
      },
    ]
  }
]