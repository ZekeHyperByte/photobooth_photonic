# Flutter Desktop Implementation - Deep Dive

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            FLUTTER PHOTOBOOTH APP                                        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              FLUTTER UI LAYER                                    │   │
│  │  ┌───────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │  SCREENS (Dart/Flutter)                                                    │  │   │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │   │
│  │  │  │ IdleScreen  │ │CodeVerify   │ │CaptureScreen│ │Frame/Filter Select  │  │  │   │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘  │  │   │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │   │
│  │  │  │PhotoReview  │ │PaymentScreen│ │Delivery     │ │Admin Dashboard      │  │  │   │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘  │  │   │
│  │  └───────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                  │   │
│  │  ┌───────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │  STATE MANAGEMENT (Riverpod)                                               │  │   │
│  │  │  • cameraProvider - Camera state, live view, capture                       │  │   │
│  │  │  • sessionProvider - Session lifecycle, timer, codes                       │  │   │
│  │  │  • photoProvider - Photos, templates, filters                            │  │   │
│  │  │  • paymentProvider - Payment status, QRIS                                │  │   │
│  │  │  • printProvider - Print queue, CUPS status                              │  │   │
│  │  └───────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                  │   │
│  │  ┌───────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │  SERVICES (Dart)                                                           │  │   │
│  │  │  • camera_service.dart - FFI to gphoto2                                    │  │   │
│  │  │  • print_service.dart - CUPS integration                                   │  │   │
│  │  │  • payment_service.dart - Midtrans HTTP API                                │  │   │
│  │  │  • template_service.dart - Frame composition                               │  │   │
│  │  │  • session_service.dart - Session management                               │  │   │
│  │  │  • whatsapp_service.dart - WhatsApp API integration                        │  │   │
│  │  └───────────────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                         PLATFORM CHANNELS / FFI                                  │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐     │   │
│  │  │  LINUX PLATFORM CHANNEL IMPLEMENTATIONS (C/C++)                          │     │   │
│  │  │                                                                          │     │   │
│  │  │  gphoto2_plugin/                                                         │     │   │
│  │  │  ├── gphoto2_plugin.h/cpp          - FFI bindings for libgphoto2         │     │   │
│  │  │  ├── camera_manager.cpp            - Camera lifecycle, detection         │     │   │
│  │  │  ├── capture_manager.cpp           - Photo capture, retry logic          │     │   │
│  │  │  ├── live_view_manager.cpp         - MJPEG stream handling               │     │   │
│  │  │  └── property_manager.cpp          - ISO, aperture, shutter speed        │     │   │
│  │  │                                                                          │     │   │
│  │  │  cups_plugin/                                                            │     │   │
│  │  │  ├── cups_plugin.h/cpp             - FFI to libcups2                     │     │   │
│  │  │  ├── printer_manager.cpp           - Printer discovery, status           │     │   │
│  │  │  └── print_job.cpp                 - Print queue, job management          │     │   │
│  │  │                                                                          │     │   │
│  │  │  image_processing/                                                      │     │   │
│  │  │  ├── image_processor.cpp           - Frame overlay, composition          │     │   │
│  │  │  └── (or use Dart image package for simple operations)                 │     │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                         DATA LAYER                                               │   │
│  │  ┌───────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │  LOCAL DATABASE (SQLite)                                                   │  │   │
│  │  │  • sqflite_common_ffi package                                              │  │   │
│  │  │  • Same schema as current Drizzle/SQLite                                   │  │   │
│  │  │  • Drift ORM (optional but recommended)                                    │  │   │
│  │  │                                                                            │  │   │
│  │  │  STORED FILES                                                              │  │   │
│  │  │  • path_provider for app directories                                       │  │   │
│  │  │  • photos/, templates/, temp/                                              │  │   │
│  │  └───────────────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Technical Challenges & Solutions

### 1. Camera Control (gphoto2)

**Challenge:** libgphoto2 is a C library. Need FFI bindings.

**Options:**

#### Option A: Use existing gphoto2 package
```dart
// gphoto2 package exists but is unmaintained
// Would need to fork and update
import 'package:gphoto2/gphoto2.dart';

// Usage would be:
final camera = await GPhoto2.autoDetect();
await camera.captureImage(outputPath: '/tmp/photo.jpg');
```

#### Option B: Write custom FFI bindings (Recommended)
```cpp
// linux/gphoto2_plugin.cpp
#include <gphoto2/gphoto2.h>
#include <flutter_linux/flutter_linux.h>

extern "C" {
    // Dart FFI entry points
    EXPORT int32_t gphoto2_initialize() {
        GPContext* context = gp_context_new();
        CameraList* cameras;
        gp_list_new(&cameras);
        
        int ret = gp_camera_autodetect(cameras, context);
        if (ret < GP_OK) return ret;
        
        return gp_list_count(cameras);
    }
    
    EXPORT int32_t gphoto2_capture_image(const char* output_path) {
        // Capture and download to output_path
        // Similar logic to current gphoto2-wrapper.js
    }
    
    EXPORT void gphoto2_start_liveview() {
        // Set up MJPEG stream
        // Emit frames via Flutter's MethodChannel or FFI callbacks
    }
}
```

```dart
// lib/services/gphoto2_service.dart
import 'dart:ffi';
import 'dart:io';

// FFI bindings
final DynamicLibrary _gphoto2Lib = DynamicLibrary.open(
  Platform.isLinux ? 'libgphoto2_plugin.so' : 'libgphoto2_plugin.dll',
);

typedef GPhoto2InitializeC = Int32 Function();
typedef GPhoto2InitializeDart = int Function();

class GPhoto2Service {
  final _initialize = _gphoto2Lib
      .lookup<NativeFunction<GPhoto2InitializeC>>('gphoto2_initialize')
      .asFunction<GPhoto2InitializeDart>();
  
  Future<int> detectCameras() async {
    return await Isolate.run(() => _initialize());
  }
  
  Stream<Uint8List> startLiveView() async* {
    // Set up stream from native code
    // Parse MJPEG stream, yield JPEG frames
  }
  
  Future<CaptureResult> capturePhoto() async {
    // Similar to current implementation
    // With retry logic, error handling
  }
}
```

**Effort:** 2-3 weeks (C++ FFI + Dart wrapper + testing)

---

### 2. Frame Designer (Replaces Konva.js)

**Challenge:** Need to recreate the drag-and-drop frame designer

**Solution:** Custom Flutter painter with gesture detection

```dart
// lib/widgets/frame_designer.dart
class FrameDesigner extends StatefulWidget {
  final Template template;
  final Function(Template) onUpdate;
  
  @override
  State<FrameDesigner> createState() => _FrameDesignerState();
}

class _FrameDesignerState extends State<FrameDesigner> {
  List<PhotoZone> zones = [];
  PhotoZone? selectedZone;
  
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onPanStart: _handlePanStart,
      onPanUpdate: _handlePanUpdate,
      onPanEnd: _handlePanEnd,
      child: CustomPaint(
        size: Size.infinite,
        painter: FramePainter(
          template: widget.template,
          zones: zones,
          selectedZone: selectedZone,
        ),
      ),
    );
  }
  
  void _handlePanUpdate(DragUpdateDetails details) {
    if (selectedZone != null) {
      setState(() {
        selectedZone!.x += details.delta.dx;
        selectedZone!.y += details.delta.dy;
      });
    }
  }
}

class FramePainter extends CustomPainter {
  final Template template;
  final List<PhotoZone> zones;
  final PhotoZone? selectedZone;
  
  @override
  void paint(Canvas canvas, Size size) {
    // Draw background frame image
    // Draw photo zones with borders
    // Draw selection handles for selected zone
    // Similar to Konva.js implementation
  }
}
```

**Effort:** 1-2 weeks (feature parity with Konva.js version)

---

### 3. Image Processing

**Challenge:** Sharp (Node.js) is fast and feature-rich. Dart alternatives?

**Options:**

#### Option A: Pure Dart (image package)
```dart
import 'package:image/image.dart' as img;

Future<void> composePhoto({
  required String templatePath,
  required List<String> photoPaths,
  required List<PhotoZone> zones,
  required String outputPath,
}) async {
  // Load template
  final template = img.decodeJpg(File(templatePath).readAsBytesSync())!;
  
  // For each photo zone
  for (final zone in zones) {
    final photo = img.decodeJpg(File(photoPaths[zone.photoIndex]).readAsBytesSync())!;
    
    // Resize photo to fit zone
    final resized = img.copyResize(
      photo,
      width: zone.width.toInt(),
      height: zone.height.toInt(),
    );
    
    // Apply filters (brightness, contrast, etc.)
    final filtered = _applyFilters(resized, zone.filters);
    
    // Composite onto template
    img.compositeImage(template, filtered, dstX: zone.x.toInt(), dstY: zone.y.toInt());
  }
  
  // Save result
  File(outputPath).writeAsBytesSync(img.encodeJpg(template, quality: 95));
}
```

**Pros:** Pure Dart, no native dependencies
**Cons:** 5-10x slower than Sharp, memory intensive

#### Option B: FFI to libvips (Recommended)
```cpp
// Similar to gphoto2 FFI
// Use libvips for fast image processing
EXPORT int32_t compose_images(
    const char* template_path,
    const char** photo_paths,
    const Zone* zones,
    int32_t zone_count,
    const char* output_path
) {
    VipsImage* template = vips_image_new_from_file(template_path, NULL);
    
    for (int i = 0; i < zone_count; i++) {
        VipsImage* photo = vips_image_new_from_file(photo_paths[i], NULL);
        VipsImage* resized;
        vips_resize(photo, &resized, 
            (double)zones[i].width / photo->Xsize, 
            "vscale", (double)zones[i].height / photo->Ysize,
            NULL);
        
        VipsImage* composited;
        vips_composite2(template, resized, &composited, VIPS_BLEND_MODE_OVER,
            "x", zones[i].x, "y", zones[i].y, NULL);
        
        template = composited;
    }
    
    return vips_image_write_to_file(template, output_path, NULL);
}
```

**Pros:** Fast, efficient memory usage
**Cons:** Additional native dependency

**Effort:** 1-2 weeks (FFI bindings + Dart wrapper)

---

### 4. State Management Migration

Current (Zustand):
```typescript
// Current
const usePhotoStore = create<PhotoState>((set) => ({
  photos: [],
  currentTemplate: null,
  addPhoto: (photo) => set((state) => ({ photos: [...state.photos, photo] })),
}));
```

Flutter (Riverpod):
```dart
// lib/providers/photo_provider.dart
import 'package:riverpod/riverpod.dart';

final photoProvider = StateNotifierProvider<PhotoNotifier, PhotoState>((ref) {
  return PhotoNotifier();
});

class PhotoState {
  final List<Photo> photos;
  final Template? currentTemplate;
  
  PhotoState({this.photos = const [], this.currentTemplate});
  
  PhotoState copyWith({List<Photo>? photos, Template? currentTemplate}) {
    return PhotoState(
      photos: photos ?? this.photos,
      currentTemplate: currentTemplate ?? this.currentTemplate,
    );
  }
}

class PhotoNotifier extends StateNotifier<PhotoState> {
  PhotoNotifier() : super(PhotoState());
  
  void addPhoto(Photo photo) {
    state = state.copyWith(photos: [...state.photos, photo]);
  }
  
  void setTemplate(Template template) {
    state = state.copyWith(currentTemplate: template);
  }
}

// Usage in widgets
class PhotoGallery extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final photos = ref.watch(photoProvider).photos;
    return GridView.builder(
      itemCount: photos.length,
      itemBuilder: (context, index) => PhotoThumbnail(photos[index]),
    );
  }
}
```

**Effort:** 3-5 days (straightforward migration)

---

## Complete Rewrite Task Breakdown

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Flutter project structure
- [ ] Configure FFI build system (CMake for Linux)
- [ ] Set up Riverpod state management
- [ ] Create basic navigation/routing
- [ ] Implement SQLite schema with Drift

### Phase 2: Camera Integration (Week 3-4)
- [ ] Write gphoto2 C++ FFI bindings
- [ ] Implement camera detection
- [ ] Implement photo capture with retry
- [ ] Implement live view stream
- [ ] Create camera state provider
- [ ] Create preview widget with live view

### Phase 3: UI Screens (Week 5-6)
- [ ] Idle screen with attract loop
- [ ] Code verification screen
- [ ] Capture screen with countdown
- [ ] Frame/filter selection
- [ ] Photo review screen
- [ ] Payment screen with QRIS
- [ ] Delivery options screen

### Phase 4: Image Processing (Week 7)
- [ ] Write libvips FFI bindings
- [ ] Implement photo composition
- [ ] Implement filter application
- [ ] Test with various template sizes

### Phase 5: Frame Designer (Week 8)
- [ ] Custom painter for zone editing
- [ ] Drag and drop zones
- [ ] Resize handles
- [ ] Property panels
- [ ] Save/load templates

### Phase 6: Print & Integration (Week 9)
- [ ] CUPS FFI bindings
- [ ] Print queue management
- [ ] Payment API integration (Midtrans)
- [ ] WhatsApp API integration

### Phase 7: Testing & Polish (Week 10-12)
- [ ] Integration testing
- [ ] Camera stress testing
- [ ] UI/UX refinement
- [ ] Performance optimization
- [ ] Deployment setup

**Total: ~12 weeks (3 months) for a single developer**

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| gphoto2 FFI issues | Medium | High | Prototype FFI first (1 week spike) |
| Performance issues (image processing) | Medium | High | Benchmark Dart vs FFI early |
| Desktop-specific Flutter bugs | Medium | Medium | Test on target Linux early |
| Package compatibility | Low | Medium | Check all packages support Linux |
| Learning curve (if new to Flutter) | High | Medium | Factor in learning time |

---

## Pros & Cons Summary

### ✅ Flutter Advantages
1. **Performance**: Smaller bundle, faster startup, lower memory
2. **UI Consistency**: Single framework, no web tech stack
3. **Mobile Path**: Easy to add iOS/Android later
4. **Type Safety**: Dart's type system is excellent
5. **Hot Reload**: Faster development iteration
6. **Future-proof**: Google backing, growing ecosystem

### ❌ Flutter Challenges
1. **Desktop Maturity**: Linux desktop support is newer, less battle-tested
2. **FFI Complexity**: Need to write/maintain C++ bindings for hardware
3. **Learning Curve**: If team doesn't know Dart/Flutter
4. **Package Gaps**: Some npm packages have no Dart equivalent
5. **Time Investment**: 3-month rewrite vs 1-week fix
6. **Printer Support**: Limited desktop printing packages

---

## Recommendation

### Consider Flutter IF:
- You plan to add **mobile apps** in the next 6-12 months
- The team has **Flutter experience** or is willing to invest in learning
- You have **3+ months** for development
- You're experiencing **Electron-specific issues** (not just camera config)
- You want a **unified codebase** for potential future platforms

### Stick with Electron IF:
- You need a **working solution quickly** (weeks, not months)
- The team is **strong in TypeScript/React**
- **Hardware integration** is the main concern (both have same challenges)
- You want to **minimize risk** with a proven codebase
- The camera issue is the **only blocker** (it's fixable!)

---

## Hybrid Approach (Best of Both?)

Consider a gradual migration:

1. **Keep Electron for now** - Fix the camera issue
2. **Extract business logic** - Move to a headless Node.js backend
3. **Create Flutter prototype** - Just the camera + capture flow
4. **Compare side-by-side** - Run both for 1 month
5. **Decide on full migration** - Based on real-world testing

This reduces risk while exploring Flutter.
