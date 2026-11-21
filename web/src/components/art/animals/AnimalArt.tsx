import type { ComponentType } from 'react'
import { isLivestockSpeciesId, type LivestockSpeciesId } from '../../../api'
import './animals.css'
import { BeefCattle } from './BeefCattle'
import { Camel } from './Camel'
import { Chicken } from './Chicken'
import { DairyCow } from './DairyCow'
import { Donkey } from './Donkey'
import { Goat } from './Goat'
import { Horse } from './Horse'
import { Pig } from './Pig'
import { Rabbit } from './Rabbit'
import { Sheep } from './Sheep'
import { Turkey } from './Turkey'
import type { AnimalArtProps } from './AnimalSvg'

export const ANIMAL_LABELS: Record<LivestockSpeciesId, string> = {
  dairy_cow: 'Dairy cows',
  beef_cattle: 'Beef cattle',
  sheep: 'Sheep',
  goat: 'Goats',
  horse: 'Horses',
  donkey: 'Donkeys',
  camel: 'Camels',
  pig: 'Pigs',
  chicken: 'Chickens',
  turkey: 'Turkeys',
  rabbit: 'Rabbits',
}

const BY_SPECIES: Record<LivestockSpeciesId, ComponentType<AnimalArtProps>> = {
  dairy_cow: DairyCow,
  beef_cattle: BeefCattle,
  sheep: Sheep,
  goat: Goat,
  horse: Horse,
  donkey: Donkey,
  camel: Camel,
  pig: Pig,
  chicken: Chicken,
  turkey: Turkey,
  rabbit: Rabbit,
}

export function AnimalArt({
  species,
  ...props
}: AnimalArtProps & { species: string }) {
  if (!isLivestockSpeciesId(species)) return null
  const Comp = BY_SPECIES[species]
  return <Comp {...props} />
}
