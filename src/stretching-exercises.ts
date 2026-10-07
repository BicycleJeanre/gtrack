export type CuratedStretchingExercise = {
  name: string;
  description: string;
  equipment: "body only" | "other";
  primaryMuscles: string[];
  secondaryMuscles: string[];
  category: "stretching";
};

const stretch = (
  name: string,
  description: string,
  primaryMuscles: string[] = [],
  secondaryMuscles: string[] = [],
  equipment: "body only" | "other" = "body only",
): CuratedStretchingExercise => ({
  name,
  description,
  equipment,
  primaryMuscles,
  secondaryMuscles,
  category: "stretching",
});

// Familiar names are intentionally kept even where the source catalogue has a
// similar movement under a less common name. This makes search useful without
// asking the user to know gym or yoga terminology first.
export const stretchingExercises = [
  stretch(
    "Gentle Walking",
    "Walk at a comfortable conversational pace to warm up and increase circulation.",
    ["quadriceps"],
    ["hamstrings", "calves"],
  ),
  stretch(
    "Shoulder Rolls",
    "Stand or sit tall and roll both shoulders slowly forward, up, back and down; reverse direction halfway through.",
    ["shoulders"],
    ["traps"],
  ),
  stretch(
    "Neck Mobility",
    "Keep the shoulders relaxed and move the head gently left, right, up and down through a comfortable range without forcing it.",
    ["neck"],
    ["traps"],
  ),
  stretch(
    "Diaphragmatic Breathing",
    "Sit or stand comfortably with hands around the lower ribs. Inhale slowly through the nose, allowing the ribs to expand, then exhale gently through the mouth.",
    ["abdominals"],
  ),
  stretch(
    "Cat-Cow Stretch",
    "Begin on hands and knees with wrists under shoulders and knees under hips. Inhale into a gentle arch, then exhale while rounding the spine; continue slowly with the breath.",
    ["lower back"],
    ["abdominals", "middle back"],
  ),
  stretch(
    "Wide-Knee Child's Pose",
    "From hands and knees, widen the knees comfortably and move the hips back only as far as comfortable. Reach the arms forward and breathe into the back and hips.",
    ["lower back"],
    ["glutes", "lats"],
  ),
  stretch(
    "Seated Butterfly Stretch",
    "Sit upright, bring the soles of the feet together and let the knees relax outward. Hold the feet and hinge forward only slightly while keeping the spine long.",
    ["adductors"],
    ["glutes"],
  ),
  stretch(
    "Pelvic Tilts",
    "Stand against a wall or use hands and knees. Gently tuck the pelvis to flatten the lower back slightly, then return to neutral with control.",
    ["abdominals"],
    ["lower back", "glutes"],
  ),
  stretch(
    "Standing Side Stretch",
    "Stand with feet about hip-width apart, reach one arm overhead and lean gently to the opposite side without twisting; repeat on the other side.",
    ["lats"],
    ["abdominals", "shoulders"],
  ),

  stretch(
    "Mountain Pose",
    "Stand tall with feet grounded, legs active, shoulders relaxed and arms resting naturally while breathing evenly.",
    ["quadriceps"],
    ["abdominals"],
  ),
  stretch(
    "Downward-Facing Dog",
    "From hands and knees, lift the hips up and back, lengthen the spine and press the floor away while keeping the knees softly bent if needed.",
    ["hamstrings"],
    ["calves", "shoulders", "lats"],
  ),
  stretch(
    "Upward-Facing Dog",
    "From a prone position, press through the hands to lift the chest while keeping the shoulders away from the ears and the front body long.",
    ["abdominals"],
    ["shoulders", "lower back"],
  ),
  stretch(
    "Cobra Pose",
    "Lie face down, place hands near the ribs and gently lift the chest using the back while keeping the elbows bent and hips grounded.",
    ["lower back"],
    ["abdominals", "shoulders"],
  ),
  stretch(
    "Forward Fold",
    "Hinge from the hips and fold over softly bent knees, letting the head and neck relax without forcing the hamstrings.",
    ["hamstrings"],
    ["calves", "lower back"],
  ),
  stretch(
    "Half Forward Fold",
    "From a forward fold, lengthen the spine until the back is flat, placing hands on the shins or blocks while keeping the neck neutral.",
    ["hamstrings"],
    ["lower back"],
  ),
  stretch(
    "Warrior I",
    "Step one foot forward, turn the back foot slightly out, square the hips forward and bend the front knee while reaching the arms overhead.",
    ["quadriceps"],
    ["glutes", "calves", "shoulders"],
  ),
  stretch(
    "Warrior II",
    "Take a wide stance, turn the front foot out, bend the front knee and extend both arms parallel to the floor while keeping the torso upright.",
    ["quadriceps"],
    ["glutes", "adductors", "shoulders"],
  ),
  stretch(
    "Reverse Warrior",
    "From Warrior II, keep the front knee bent, slide the rear hand down the back leg and reach the front arm up and back through the side body.",
    ["quadriceps"],
    ["lats", "abdominals"],
  ),
  stretch(
    "Triangle Pose",
    "Straighten the front leg from a wide stance, hinge over it and reach one hand down and the other up while keeping both sides of the torso long.",
    ["hamstrings"],
    ["adductors", "abdominals"],
  ),
  stretch(
    "Extended Side Angle",
    "From a wide lunge, rest the front forearm lightly on the thigh or place the hand near the foot and reach the opposite arm overhead.",
    ["quadriceps"],
    ["adductors", "lats"],
  ),
  stretch(
    "Tree Pose",
    "Balance on one leg and place the other foot at the ankle, calf or inner thigh, avoiding the knee; bring hands together and stand tall.",
    ["glutes"],
    ["quadriceps", "calves"],
  ),
  stretch(
    "Low Lunge",
    "Step one foot forward and lower the back knee. Keep the front knee over the ankle and gently shift the hips forward while lifting the torso.",
    ["quadriceps"],
    ["glutes"],
  ),
  stretch(
    "High Lunge",
    "Step into a long stance with the back heel lifted, bend the front knee and reach the arms overhead while keeping the torso tall.",
    ["quadriceps"],
    ["glutes", "calves"],
  ),
  stretch(
    "Pigeon Pose",
    "Bring one bent leg forward and extend the other leg behind. Keep the hips supported and square, staying upright or folding only as comfortable.",
    ["glutes"],
    ["adductors"],
  ),
  stretch(
    "Bridge Pose",
    "Lie with knees bent and feet planted, press through the feet and lift the hips while keeping the ribs controlled and knees aligned.",
    ["glutes"],
    ["hamstrings", "lower back"],
  ),
  stretch(
    "Happy Baby Pose",
    "Lie on the back, draw the knees toward the ribs and hold the thighs, shins or outer feet while keeping the lower back comfortable.",
    ["adductors"],
    ["glutes", "hamstrings"],
  ),
  stretch(
    "Supine Spinal Twist",
    "Lie on the back and guide bent knees gently to one side while keeping both shoulders relaxed toward the floor; repeat on the other side.",
    ["lower back"],
    ["glutes", "middle back"],
  ),
  stretch(
    "Seated Spinal Twist",
    "Sit tall, rotate gently from the ribs and upper back, and use the hands only for light support; repeat on the other side.",
    ["middle back"],
    ["abdominals", "lower back"],
  ),
  stretch(
    "Sphinx Pose",
    "Lie face down with forearms under the shoulders and gently lift the chest while keeping the hips and legs relaxed on the floor.",
    ["lower back"],
    ["abdominals"],
  ),
  stretch(
    "Camel Pose",
    "Kneel with hips over knees, lift through the chest and reach toward the heels or keep hands at the lower back while avoiding compression.",
    ["abdominals"],
    ["quadriceps", "shoulders"],
  ),
  stretch(
    "Corpse Pose (Savasana)",
    "Rest in a comfortable supported position with the arms relaxed and attention on slow, easy breathing.",
    [],
    [],
  ),
  stretch(
    "Thread the Needle",
    "From hands and knees, slide one arm under the other and lower the shoulder toward the floor while keeping the hips over the knees.",
    ["middle back"],
    ["shoulders", "lats"],
  ),
  stretch(
    "Legs Up the Wall",
    "Sit beside a wall and carefully turn to rest the legs upward, keeping the hips a comfortable distance from the wall and the upper body relaxed.",
    ["hamstrings"],
    ["calves"],
  ),
  stretch(
    "Figure Four Stretch",
    "Cross one ankle over the opposite thigh and gently draw the legs toward the body while keeping the head and shoulders relaxed.",
    ["glutes"],
    ["adductors"],
  ),

  stretch(
    "Standing Hamstring Stretch",
    "Place one heel slightly forward, keep that knee soft and hinge at the hips with a long spine until the back of the thigh stretches.",
    ["hamstrings"],
    ["calves"],
  ),
  stretch(
    "Kneeling Hip Flexor Stretch",
    "Kneel in a split stance, gently tuck the pelvis and shift forward until the front of the rear hip stretches.",
    ["quadriceps"],
    ["glutes"],
  ),
  stretch(
    "Standing Quadriceps Stretch",
    "Stand tall with support if needed, bend one knee and hold the ankle or trouser leg while keeping the knees close together.",
    ["quadriceps"],
  ),
  stretch(
    "Wall Calf Stretch",
    "Place both hands on a wall, step one foot back and press that heel down while keeping the toes forward and rear knee straight.",
    ["calves"],
  ),
  stretch(
    "Doorway Chest Stretch",
    "Place a forearm on a doorway with the elbow below shoulder height and turn the torso away gently until the chest stretches.",
    ["chest"],
    ["shoulders"],
  ),
  stretch(
    "Cross-Body Shoulder Stretch",
    "Bring one arm across the chest and use the opposite forearm to draw it closer without lifting the shoulder.",
    ["shoulders"],
    ["traps"],
  ),
  stretch(
    "Overhead Triceps Stretch",
    "Reach one arm overhead, bend the elbow and use the opposite hand for gentle pressure while keeping the ribs controlled.",
    ["triceps"],
    ["shoulders"],
  ),
  stretch(
    "Forearm Flexor Stretch",
    "Extend one arm with the palm up and use the other hand to draw the fingers down gently until the inner forearm stretches.",
    ["forearms"],
  ),
  stretch(
    "Forearm Extensor Stretch",
    "Extend one arm with the palm down and use the other hand to bend the wrist gently until the outer forearm stretches.",
    ["forearms"],
  ),
  stretch(
    "Upper Trapezius Stretch",
    "Sit or stand tall, tilt one ear toward the same-side shoulder and keep the opposite shoulder relaxed; repeat on the other side.",
    ["traps"],
    ["neck"],
  ),
  stretch(
    "90/90 Hip Stretch",
    "Sit with both knees bent at roughly 90 degrees, keep the spine long and lean toward the front shin only as comfortable.",
    ["glutes"],
    ["adductors"],
  ),
  stretch(
    "Adductor Rock Back",
    "Begin on hands and knees, extend one leg to the side and rock the hips backward while keeping the spine neutral.",
    ["adductors"],
    ["glutes"],
  ),
  stretch(
    "Open Book Thoracic Rotation",
    "Lie on one side with knees bent and arms together, then rotate the top arm and upper back open while the knees remain stacked.",
    ["middle back"],
    ["chest", "shoulders"],
  ),
  stretch(
    "Frog Stretch",
    "From hands and knees, widen the knees gradually and keep the ankles in line with them while moving the hips back only as comfortable.",
    ["adductors"],
    ["glutes"],
  ),
  stretch(
    "Ankle Dorsiflexion Stretch",
    "Face a wall in a short split stance and guide the front knee toward the wall while keeping that heel planted.",
    ["calves"],
  ),
  stretch(
    "Lying Glute Stretch",
    "Lie on the back, bring one knee toward the chest and guide it gently across the body while keeping the hips comfortable.",
    ["glutes"],
    ["lower back"],
  ),
  stretch(
    "IT Band Stretch",
    "Stand tall, cross one leg behind the other and lean away from the rear leg until the outside of the hip and thigh stretches.",
    ["abductors"],
    ["glutes"],
  ),
  stretch(
    "Chest Opener Stretch",
    "Clasp the hands behind the back or hold a strap, lengthen the arms and gently draw the shoulders back while lifting the chest.",
    ["chest"],
    ["shoulders", "biceps"],
  ),
] satisfies CuratedStretchingExercise[];
