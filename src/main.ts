import Phaser from 'phaser'
import { MenuScene } from './scenes/MenuScene'
import { CombatScene } from './scenes/CombatScene'
import { VictoryScene } from './scenes/VictoryScene'
import { DefeatScene } from './scenes/DefeatScene'
import { MapScene } from './scenes/MapScene'
import { ShopScene } from './scenes/ShopScene'
import { RestScene } from './scenes/RestScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 640,
  height: 900,
  parent: 'game',
  backgroundColor: '#1a1a2e',
  scene: [MenuScene, CombatScene, VictoryScene, DefeatScene, MapScene, ShopScene, RestScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}

document.fonts.ready.then(() => {
  const game = new Phaser.Game(config)
  ;(window as unknown as Record<string, unknown>).__game = game
})
