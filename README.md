# Pressures: Labour (In) The Internal Landscape

**Pressures: Labour (In) The Internal Landscape** is an interactive audiovisual artwork that explores the invisible labour of emotional regulation. The project asks how the internal work required to live with anxiety, burnout, depression, or other mental health struggles can be made visible, felt, and recognized as a legitimate form of labour.

In contemporary society, work is often valued only when it is visible, measurable, and economically productive. By contrast, the daily effort of managing one’s internal state is often hidden, misunderstood, or dismissed. *Pressures* critiques this narrow definition of labour by externalizing the inner landscape of mental health into a reactive audiovisual system. The viewer is invited to type thoughts into the interface and observe how the system responds, destabilizes, calms, or intensifies.

The work functions as both a simulation and a metaphor. Its changing audiovisual environment does not claim to objectively represent mental illness; instead, it creates an experiential analogy for the constant, often exhausting work of maintaining internal balance.

## Artist Statement

*Pressures* was created as a response to the invisibility of mental-health labour. People experiencing anxiety, burnout, depression, or other psychological difficulties often perform continuous internal maintenance simply to function in daily life. This effort can involve monitoring one’s thoughts, regulating emotional intensity, managing exhaustion, avoiding collapse, recovering from stress, or trying to remain socially and professionally functional despite internal instability.

This labour is rarely recognized as labour. It does not always produce a visible object, a measurable output, or an economically useful result. Because of this, it is often ignored or devalued by a society that tends to prioritize productivity, performance, and external achievement.

The project reframes emotional regulation as a form of maintenance: repetitive, necessary, difficult, and essential to survival. By making this internal process visible and interactive, *Pressures* invites viewers to reconsider what counts as work, what remains invisible, and whose effort is recognized.

## Concept

The central question behind the project is:

> How can we value and make visible the invisible labour involved in managing mental-health difficulties?

The piece answers this question through an interactive system that externalizes an internal emotional landscape. The viewer enters text into the interface. The system interprets the emotional qualities of that text and translates them into changing visual and sonic states.

The result is an audiovisual metaphor for the nervous system under pressure. Calm inputs may produce softer, slower, more stable audiovisual behaviour. More charged or distressing inputs may increase intensity, instability, sharpness, noise, and movement. The work asks the viewer not only to understand emotional regulation intellectually, but to experience a simplified analogy of its ongoing effort.

## Experience

The interaction is intentionally minimal. The viewer encounters an abstract visual field and a text input. By typing thoughts, phrases, or emotional statements into the system, they influence the state of the work.

The system responds through:

* changes in colour;
* shifts in movement and frequency;
* changes in visual sharpness, density, and instability;
* evolving layers of atmospheric sound;
* transitions between calmer and more activated internal states.

The viewer may attempt to stabilize the system, but the work is not designed as a traditional game with a clear win condition. Instead, the interaction highlights the difficulty of regulation itself. The system may resist immediate calming, remain unstable, or respond disproportionately, reflecting the way mental-health states can be difficult to control through intention alone.

## How It Works

The project is built as a generative audiovisual system driven by text input and emotional-state modelling.

At a high level, the system follows this pipeline:

1. The viewer enters text.
2. The text is analyzed using a VAD-based natural language model.
3. The model outputs values for valence, arousal, and dominance.
4. These values are interpreted by a custom emotional-state engine.
5. The emotional-state engine updates internal variables such as load, peace, activation, vigilance, instability, constriction, and clarity.
6. These internal values are sent to visual and audio modules.
7. The visual and audio systems generate a changing audiovisual environment based on the current simulated emotional state.

The work is generative because the final audiovisual output is not fixed in advance. Instead, it emerges from the interaction between the viewer’s text, the affect-analysis model, the emotional-state engine, and the audiovisual generation systems.

## Technical Architecture

The project combines machine learning, finite-state/emotional modelling, generative visuals, and interactive sound design.

### Text Input

The viewer’s text acts as the primary input. Each submitted phrase is treated as a signal that can affect the simulated internal state of the system.

### Affect Analysis

The text is analyzed using **VAD-BERT**, a natural language processing model that maps language into three affective dimensions:

* **Valence**: how positive or negative the input is;
* **Arousal**: how activated, intense, or energetic the input is;
* **Dominance**: how much control or agency the input implies.

These values provide the raw emotional signal used by the rest of the system.

### Emotional-State Engine

The VAD values are passed into a custom modelling engine that maintains the current internal state of the simulated system. Rather than treating each input as isolated, the engine accumulates and transforms emotional signals over time.

The internal state includes variables such as:

* **load** — nervous-system demand;
* **peace** — calm or internal rest;
* **activation** — emotional or physiological excitation;
* **vigilance** — alertness or threat monitoring;
* **instability** — tendency to react disproportionately to change;
* **constriction** — emotional narrowing or restriction;
* **altitude** — clarity, distance, or perspective.

These values are then used to drive the audiovisual output.

### Visual Module

The visual system translates internal emotional variables into generative visual parameters. These may affect:

* Perlin noise;
* colour;
* movement frequency;
* sharpness of peaks;
* density;
* rhythm;
* overall visual intensity.

In calmer states, the visuals tend toward softer colours, slower motion, and smoother forms. In more anxious or activated states, the visuals become sharper, faster, more saturated, and more unstable.

### Audio Module

The sound component uses **Max/MSP** and **FluCoMa** to generate an evolving soundscape. The emotional-state values are mapped to the volume and presence of different sound samples, producing an atmospheric environment that shifts with the simulated internal condition.

The soundscape combines environmental recordings such as rain, thunder, city ambience, nature sounds, people talking, and ambient textures. These sounds are layered dynamically to reflect changes in the internal state of the system.

## Technologies Used

* Natural language processing
* VAD-BERT
* Valence / Arousal / Dominance affect modelling
* Custom emotional-state modelling
* Generative visual programming
* Perlin noise
* Max/MSP
* FluCoMa
* Freesound audio samples
* Interactive audiovisual design

## Visual Design

The visual design uses abstraction rather than literal representation. Instead of showing a person, face, or explicit narrative, the work presents an internal landscape through colour, motion, rhythm, and density.

The report documents two contrasting visual states:

* a calmer green state with lower movement frequency;
* a highly anxious pink/purple state with sharper peaks and faster motion.

This contrast makes the invisible state of the system perceptible. The viewer does not see “mental illness” directly; they see a dynamic landscape that reacts, destabilizes, and changes under pressure.

## Sound Design

The soundscape extends the emotional state of the work into the auditory field. Environmental recordings are not used as fixed background music, but as flexible layers whose intensity shifts according to the system’s internal variables.

The project uses sound samples from Freesound, including rain, thunder, city ambience, nature ambience, ambient waves, and crowd sounds. These materials help create an immersive emotional environment that can move between calm, tension, pressure, and overload.

The sound design was influenced by Norah Wilcox’s *A Familiar Soundscape: Beaver Lake in July*, particularly in its use of recorded sound environments as immersive material.

## References and Influences

The project is conceptually and technically informed by several references.

### Mierle Laderman Ukeles — Maintenance Art

Ukeles’ *MANIFESTO FOR MAINTENANCE ART* influenced the project’s framing of emotional regulation as maintenance work. Where Ukeles foregrounds physical, domestic, and social maintenance, *Pressures* extends this logic toward psychological maintenance and self-regulation.

### Philip Galanter — Generative Art

The project follows Galanter’s definition of generative art as an artistic practice in which the artist creates a system that operates with some degree of autonomy. In *Pressures*, the artwork is not a fixed object but a dynamic system whose output emerges from rules, interaction, affect modelling, and audiovisual generation.

### Lev Manovich — Database and New Media

The project also relates to Manovich’s idea of the database as a cultural form in new media. *Pressures* does not unfold as a linear narrative. Instead, meaning emerges through interaction with a structured set of data, parameters, and transformations.

### VAD Emotional Modelling

The project uses the Valence / Arousal / Dominance model of affect to translate language into emotional coordinates. This allows the system to map text input into values that can be interpreted by the emotional-state engine.

### Norah Wilcox — Soundscape Influence

The sound design was inspired by Norah Wilcox’s *A Familiar Soundscape: Beaver Lake in July*, particularly its use of layered environmental recordings to construct an immersive virtual atmosphere.

## Limitations

The project is an artistic simulation, not a clinical model. Its emotional-state engine is interpretive and metaphorical rather than diagnostic or objective.

Some limitations include:

* the affect model depends on language data and may contain biases;
* the text-analysis model is limited in its linguistic interpretation;
* the emotional mappings are artistic decisions, not medical claims;
* the project benefits from contextual explanation or mediation;
* audience understanding may depend on how clearly the system architecture and concept are introduced.

These limitations are also part of the work’s critical context. The system does not reveal an objective truth about emotion; it stages a mediated, computational interpretation of affect.

## Future Work

Future versions of the project could expand the interaction and clarify the relationship between input, internal state, and audiovisual output.

Possible improvements include:

* adding clearer feedback about the system’s internal state;
* improving the visual vocabulary of different emotional conditions;
* expanding support for multiple languages;
* refining the emotional-state engine;
* adding a visible state/debug panel for exhibition contexts;
* improving transitions between calm, anxious, frozen, overloaded, and recovering states;
* creating a more complete installation format with projection and spatial audio;
* adding documentation that helps viewers understand the conceptual framing before or after interacting with the piece.

## Credits

Created by **Philippe Beauchemin** & **Philippe Hébert** for **FFAR 249**, Faculty of Fine Arts, Concordia University.

## License

This project contains code, documentation, visual material, and third-party sound samples. Licenses may differ between components.

**Code:** CC-4.0, see LICENSE.md<br/>
**Documentation:** CC-4.0<br/>
**Sound samples:** Refer to individual Freesound sample licenses on Freesound.org

## Sound Sample Credits

The project uses sound samples from Freesound by multiple authors, including Robinhood76, vumseplutten1709, klankbeeld, stixthule, bloke09, Erokia, BurghRecords, LookIMadeAThing, kevp888, and philipecp.

See the project report or repository documentation for the complete list of sound sample URLs and licenses.
