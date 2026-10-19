// The photos sent to Pl@ntNet, each with what it shows: a tap changes the
// organ (leaf, flower…), a long press removes the photo. The chips above set
// the organ the next photos will carry.
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { t } from '@/lib/i18n'
import { ORGANS, type Organ } from '@/lib/survey'
import { Body, Chip, Label } from '@/ui/kit'
import { colors, fonts, radius, space } from '@/ui/theme'

export type OrganPhoto = { file: string; organ: Organ }

export function OrganChoice({ value, onChange }: { value: Organ; onChange: (organ: Organ) => void }) {
  return (
    <View style={{ gap: space.xs }}>
      <Label>{t('mobile.organs.next')}</Label>
      <View style={s.chips}>
        {ORGANS.map((organ) => <Chip key={organ} label={t(`mobile.organs.${organ}`)} selected={value === organ} onPress={() => onChange(organ)} />)}
      </View>
    </View>
  )
}

export function OrganPhotos({ photos, onCycle, onRemove, keptFirst = false }: {
  photos: OrganPhoto[]; onCycle: (file: string) => void; onRemove: (file: string) => void; keptFirst?: boolean
}) {
  if (photos.length === 0) return null
  return (
    <View style={{ gap: space.xs }}>
      <View style={s.photos}>
        {photos.map((photo, index) => (
          <Pressable key={photo.file} onPress={() => onCycle(photo.file)} onLongPress={() => onRemove(photo.file)}
            accessibilityLabel={`${t('plantnet.section.photo_alt', { index: index + 1 })}, ${t(`mobile.organs.${photo.organ}`)}`}
            accessibilityHint={t('mobile.organs.hint')}>
            <Image source={{ uri: photo.file }} style={[s.photo, keptFirst && index === 0 && s.kept]} />
            <Text style={s.organ} numberOfLines={1}>{t(`mobile.organs.${photo.organ}`)}</Text>
          </Pressable>
        ))}
      </View>
      <Body muted>{t('mobile.organs.hint')}</Body>
    </View>
  )
}

/** The form fields Pl@ntNet needs: the photos and, in the same order, what each shows. */
export const organLists = (photos: OrganPhoto[]) => ({ 'organs[]': photos.map((p) => p.organ) })

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photo: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.loam100 },
  kept: { borderWidth: 3, borderColor: colors.prune600 },
  organ: { width: 96, textAlign: 'center', fontSize: 14, fontFamily: fonts.medium, color: colors.loam700, marginTop: 2 },
})
