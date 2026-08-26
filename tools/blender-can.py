# Headless Blender/Cycles render of the VOLTIC can — same authored textures
# as the three.js version, but path-traced: real bounced light, area-light
# softness, and a physically glossy floor.
#   blender -b -P tools/blender-can.py -- <outdir> <angles-csv> <samples> <scale>
import bpy, math, sys

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
ANGLES = [float(a) for a in argv[1].split(',')]
SAMPLES = int(argv[2]) if len(argv) > 2 else 200
SCALE = float(argv[3]) if len(argv) > 3 else 1.0
TEX = '/private/tmp/claude-501/-Users-joshadmin-Documents-src/5efd4a2d-4cb0-4ecd-898a-3c813291bbb5/scratchpad'

R, BODY_H, FLOOR = 0.29, 1.42, -0.86

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices: d.use = True
scene.cycles.device = 'GPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.render.resolution_x = int(720 * SCALE)
scene.render.resolution_y = int(1080 * SCALE)
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Base Contrast'
scene.view_settings.exposure = -0.35

# ── world: near-black with a faint top glow ──────────────────────────────
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.004, 0.006, 0.007, 1)
bg.inputs[1].default_value = 1.0

def img(path, noncolor=False):
    im = bpy.data.images.load(path)
    if noncolor: im.colorspace_settings.name = 'Non-Color'
    return im

# ── body material ────────────────────────────────────────────────────────
mat = bpy.data.materials.new('can'); mat.use_nodes = True
nt = mat.node_tree; p = nt.nodes['Principled BSDF']
def texnode(image, x, y):
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = image; n.location = (x, y)
    return n
label = texnode(img(f'{TEX}/blender-label.png'), -600, 300)
glow = texnode(img(f'{TEX}/blender-glow.png'), -600, 0)
rough = texnode(img(f'{TEX}/blender-drops-rough-dense.png', True), -600, -300)
height = texnode(img(f'{TEX}/blender-drops-height-dense.png', True), -600, -600)
# tile the droplet maps like the web version
mapping = nt.nodes.new('ShaderNodeMapping'); mapping.location = (-820, -450)
mapping.inputs['Scale'].default_value = (2.5, 2.0, 1)
uv = nt.nodes.new('ShaderNodeUVMap'); uv.location = (-1000, -450)
nt.links.new(uv.outputs[0], mapping.inputs[0])
nt.links.new(mapping.outputs[0], rough.inputs[0])
nt.links.new(mapping.outputs[0], height.inputs[0])
for t in (rough, height):
    t.extension = 'REPEAT'
bump = nt.nodes.new('ShaderNodeBump'); bump.location = (-300, -600)
bump.inputs['Strength'].default_value = 0.4
nt.links.new(height.outputs['Color'], bump.inputs['Height'])
nt.links.new(label.outputs['Color'], p.inputs['Base Color'])
nt.links.new(rough.outputs['Color'], p.inputs['Roughness'])
nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
nt.links.new(glow.outputs['Color'], p.inputs['Emission Color'])
p.inputs['Emission Strength'].default_value = 1.1
p.inputs['Metallic'].default_value = 0.12
p.inputs['Coat Weight'].default_value = 0.08

def metal(name, color, roughness, metallic=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    pb = m.node_tree.nodes['Principled BSDF']
    pb.inputs['Base Color'].default_value = (*color, 1)
    pb.inputs['Roughness'].default_value = roughness
    pb.inputs['Metallic'].default_value = metallic
    return m
silver = metal('silver', (0.73, 0.76, 0.78), 0.3)
dark = metal('dark', (0.045, 0.05, 0.055), 0.5, 0.6)

# ── geometry ─────────────────────────────────────────────────────────────
can_parts = []
def add(obj, m):
    obj.data.materials.append(m); can_parts.append(obj); return obj

# body built by hand so the UVs are exact: u wraps the circumference with the
# label front (u=0.25) facing the camera at rotation 0, v spans the height
import bmesh
mesh = bpy.data.meshes.new('body')
bm = bmesh.new()
N = 128
ring_bot, ring_top = [], []
for i in range(N):
    th = 2 * math.pi * (i / N) - math.pi  # u=0.25 -> faces -Y (the camera)
    x, y = R * math.cos(th), R * math.sin(th)
    ring_bot.append(bm.verts.new((x, y, -BODY_H / 2)))
    ring_top.append(bm.verts.new((x, y, BODY_H / 2)))
uvl = bm.loops.layers.uv.new()
for i in range(N):
    j = (i + 1) % N
    f = bm.faces.new((ring_bot[i], ring_bot[j], ring_top[j], ring_top[i]))
    u0, u1 = i / N, (i + 1) / N
    for loop, uvco in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
        loop[uvl].uv = uvco
bm.normal_update()
bm.to_mesh(mesh); bm.free()
body = bpy.data.objects.new('body', mesh)
scene.collection.objects.link(body)
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.shade_smooth()
add(body, mat)

bpy.ops.mesh.primitive_cone_add(vertices=128, radius1=R, radius2=R * 0.86, depth=0.1, location=(0, 0, BODY_H / 2 + 0.05))
add(bpy.context.object, dark); bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_torus_add(major_radius=R * 0.86, minor_radius=0.014, location=(0, 0, BODY_H / 2 + 0.1))
add(bpy.context.object, silver); bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=R * 0.85, depth=0.012, location=(0, 0, BODY_H / 2 + 0.088))
add(bpy.context.object, silver)
bpy.ops.mesh.primitive_torus_add(major_radius=0.055, minor_radius=0.011, location=(0, -0.05, BODY_H / 2 + 0.1))
add(bpy.context.object, silver); bpy.ops.object.shade_smooth()
# base: wide at the body, tucking inward to the floor (radius1 = bottom)
bpy.ops.mesh.primitive_cone_add(vertices=128, radius1=R * 0.80, radius2=R,
                                depth=0.085, location=(0, 0, -BODY_H / 2 - 0.0425))
add(bpy.context.object, dark); bpy.ops.object.shade_smooth()
# closed underside disc, just above the floor so it never z-fights
bpy.ops.mesh.primitive_circle_add(vertices=128, radius=R * 0.80, fill_type='NGON',
                                  location=(0, 0, -BODY_H / 2 - 0.0845))
add(bpy.context.object, dark)

root = bpy.data.objects.new('root', None); scene.collection.objects.link(root)
for o in can_parts: o.parent = root
root.location.z = FLOOR + BODY_H / 2 + 0.08 - 0  # parts already centered at 0; lift whole can
root.location.z = FLOOR + BODY_H / 2 + 0.08

# ── glossy sweep: floor curving up into the backdrop (infinity cove), so
# there is no hard horizon edge anywhere in frame ────────────────────────
bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 6, FLOOR))
floor = bpy.context.object
bpy.ops.object.modifier_add(type='SUBSURF')
floor.modifiers['Subdivision'].subdivision_type = 'SIMPLE'
floor.modifiers['Subdivision'].levels = 6
floor.modifiers['Subdivision'].render_levels = 6
bpy.ops.object.modifier_add(type='SIMPLE_DEFORM')
bend = floor.modifiers['SimpleDeform']
bend.deform_method = 'BEND'
bend.deform_axis = 'X'
bend.angle = math.radians(-92)
bpy.ops.object.shade_smooth()
fm = bpy.data.materials.new('floor'); fm.use_nodes = True
fp = fm.node_tree.nodes['Principled BSDF']
fp.inputs['Base Color'].default_value = (0.006, 0.008, 0.009, 1)
fp.inputs['Roughness'].default_value = 0.24
fp.inputs['Metallic'].default_value = 0.0
fp.inputs['Specular IOR Level'].default_value = 0.55
floor.data.materials.append(fm)

# ── the studio rig as real area lights ───────────────────────────────────
target = bpy.data.objects.new('aim', None)
scene.collection.objects.link(target)
target.location = (0, 0, 0)
def area(name, loc, color, power, size, size_y=None):
    d = bpy.data.lights.new(name, 'AREA')
    d.color = color; d.energy = power
    if size_y:
        d.shape = 'RECTANGLE'; d.size = size; d.size_y = size_y
    else:
        d.size = size
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o)
    o.location = loc
    c = o.constraints.new('TRACK_TO')
    c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return o
area('key', (0.9, -2.6, 1.9), (1, 1, 1), 42, 2.4, 3.4)
area('cyan', (-2.6, 1.2, 0.4), (0.18, 0.85, 0.96), 95, 0.5, 4.5)
area('lime', (2.6, 1.3, 0.2), (0.72, 0.91, 0.24), 80, 0.5, 4.5)
area('fill', (0, -3.2, -0.5), (0.57, 0.64, 0.68), 8, 3)

# ── camera: matches the three.js framing ─────────────────────────────────
cam = bpy.data.cameras.new('cam'); cam.lens_unit = 'FOV'; cam.angle = math.radians(32)
camo = bpy.data.objects.new('cam', cam); scene.collection.objects.link(camo)
camo.location = (0, -4.7, 0.14)
camo.rotation_euler = (math.radians(87.8), 0, 0)
scene.camera = camo

# ── render each angle ────────────────────────────────────────────────────
# calibration: label front (texture u=0.25) faces camera at base_rot; the
# visible surface must glide right-to-left as the angle grows (matches web)
BASE = math.radians(30)
for a in ANGLES:
    root.rotation_euler = (0, 0, BASE - math.radians(a))  # minus: surface glides right-to-left like the web
    scene.render.filepath = f'{OUT}/blender-{int(a):03d}.png'
    bpy.ops.render.render(write_still=True)
    print(f'rendered {a}')
