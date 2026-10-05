export type ActorProportions = {
  totalHeight: number
  headRadius: number
  neckLength: number
  torsoLength: number
  torsoRadius: number
  pelvisWidth: number
  pelvisHeight: number
  pelvisDepth: number
  shoulderWidth: number
  upperArmLength: number
  forearmLength: number
  handLength: number
  thighLength: number
  shinLength: number
  footLength: number
  footHeight: number
  shoulderRadius: number
  upperArmRadius: number
  forearmRadius: number
  thighRadius: number
  shinRadius: number
}

export const CANONICAL_ACTOR_PROPORTIONS: ActorProportions = {
  totalHeight: 1.78,
  headRadius: 0.13,
  neckLength: 0.1,
  torsoLength: 0.47,
  torsoRadius: 0.2,
  pelvisWidth: 0.29,
  pelvisHeight: 0.2,
  pelvisDepth: 0.19,
  shoulderWidth: 0.41,
  upperArmLength: 0.29,
  forearmLength: 0.25,
  handLength: 0.11,
  thighLength: 0.4,
  shinLength: 0.38,
  footLength: 0.23,
  footHeight: 0.08,
  shoulderRadius: 0.075,
  upperArmRadius: 0.055,
  forearmRadius: 0.047,
  thighRadius: 0.09,
  shinRadius: 0.065,
}

export function actorProportionHeight(proportions: ActorProportions = CANONICAL_ACTOR_PROPORTIONS): number {
  return proportions.footHeight + proportions.shinLength + proportions.thighLength + proportions.pelvisHeight * 0.42 + proportions.torsoLength + proportions.neckLength + proportions.headRadius * 2
}
