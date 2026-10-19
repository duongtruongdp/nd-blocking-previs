import ARKit
import simd

struct NDPhonePose {
    let position: [Float]
    let orientation: [Float]
}

/// The only ARKit-to-ND conversion layer.
/// ARKit camera space is right-handed with +Y up and camera forward on -Z,
/// matching the ND stage convention. Translation is therefore preserved in
/// meters and the 3x3 camera rotation is serialized as x/y/z/w.
enum NDPhonePoseMath {
    static func pose(from cameraTransform: simd_float4x4) -> NDPhonePose {
        let position = [cameraTransform.columns.3.x, cameraTransform.columns.3.y, cameraTransform.columns.3.z]
        let rotation = simd_float3x3(
            SIMD3<Float>(cameraTransform.columns.0.x, cameraTransform.columns.0.y, cameraTransform.columns.0.z),
            SIMD3<Float>(cameraTransform.columns.1.x, cameraTransform.columns.1.y, cameraTransform.columns.1.z),
            SIMD3<Float>(cameraTransform.columns.2.x, cameraTransform.columns.2.y, cameraTransform.columns.2.z)
        )
        let quaternion = simd_quatf(rotation)
        return NDPhonePose(position: position, orientation: [quaternion.vector.x, quaternion.vector.y, quaternion.vector.z, quaternion.vector.w])
    }
}
