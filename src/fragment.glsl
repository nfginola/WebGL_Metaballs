#define MAX_STEPS 100
#define FAR_PLANE 115.
#define HIT_RANGE .01
#define BALL_HARD_LIMIT 30

precision highp float;
varying vec2 v_uv;

uniform vec3 u_pos;
uniform mat4 u_camRotMat;
uniform vec2 u_clientResolution;
uniform float u_elapsedTime;

uniform float u_blobFactor;
uniform int u_activeBallCount;
uniform vec4 u_balls[BALL_HARD_LIMIT];
uniform vec3 u_colors[BALL_HARD_LIMIT];
uniform bool u_shadowOn;
uniform bool u_diffuseOn;
uniform bool u_normalsOnly;

vec2 sminCubic2(float a, float b, float k)
{
    float h = max(k - abs(a - b), 0.0 ) / k;
    float m = h * h * h * 0.5;
    float s = m * k * (1.0 / 3.0); 
    return (a < b) ? vec2(a - s, m) : vec2(b - s, 1.0 - m);
}

float sdSphere(vec3 centerPoint, float radius)
{
    return length(centerPoint) - radius;
}

float sdPlane(vec3 p, vec3 normal, float dist)
{
    return dot(p, normal) + dist;
}

vec4 mainSphScene(vec3 p)
{
    vec2 minSph = vec2(FAR_PLANE * 5., 0.);
    vec3 col = vec3(1.);
    for (int i = 0; i < BALL_HARD_LIMIT; ++i) 
    {
        if (i >= u_activeBallCount)
            break;

        float sph = sdSphere(p - u_balls[i].xyz, u_balls[i].w);
        minSph = sminCubic2(minSph.x, sph, u_blobFactor);

        col = mix(col, u_colors[i], minSph.y);
    }

    col = normalize(col);

    return vec4(col, minSph);
}

vec4 getDistToScene(vec3 p)
{
    vec3 color = vec3(0.);

    // CPU simulated metaballs
    vec4 mainSphSceneRes = mainSphScene(p);
    float dMainSphScene = mainSphSceneRes.w;

    color = mainSphSceneRes.xyz;

    // Axis aligned plane at bottom
    float groundPlane = p.y + 2.5;
    float leftPlane = sdPlane(p, vec3(1., 0., 0.), 40.);
    float rightPlane = sdPlane(p, vec3(-1., 0., 0.), 40.);
    float frontPlane = sdPlane(p, vec3(0., 0., -1), 60.);
    float backPlane = sdPlane(p, vec3(0., 0., 1.), 20.);
    float roofPlane = sdPlane(p, vec3(0., -1., 0.), 60.);

    float finalPlane = min(groundPlane, min(leftPlane, min(rightPlane, min(frontPlane, min(backPlane, roofPlane)))));

    float closest = min(finalPlane, dMainSphScene);

    // if plane evaluated --> set color to white instead of metaball blend
    if (finalPlane < dMainSphScene)
    {
        color = vec3(1.);
    }

    return vec4(color, closest);
}

vec3 getNormal(vec3 p)
{
    float d = getDistToScene(p).w;
    
    // find normal by gradient approximation! (h = 1)
    vec3 n = vec3(
        d - getDistToScene(p - vec3(0.01, 0, 0)).w,  //dx
        d - getDistToScene(p - vec3(0, 0.01, 0)).w,  //dy
        d - getDistToScene(p - vec3(0, 0, 0.01)).w   //dz
    );
    
    return normalize(n);
}

vec4 rayMarch(vec3 ro, vec3 rd) 
{
    // dist from origin along direction
    float distFromOrigin = 0.;
    vec3 col = vec3(0.);

    for (int i = 0; i < MAX_STEPS; ++i)
    {
        // Evaluate new point after sphere-marching
        vec3 newP = ro + rd * distFromOrigin;
        vec4 sceneRes = getDistToScene(newP);

        float closestSceneDist = sceneRes.w;
        col = sceneRes.xyz;
        
        distFromOrigin += closestSceneDist;
        
        if (closestSceneDist < HIT_RANGE || distFromOrigin > FAR_PLANE)
            break;
    }
    return vec4(col, distFromOrigin);
}

vec3 getLight(vec3 p, vec3 color)
{
    // calculate diffuse
    vec3 lightPos1 = vec3(0, 18, 3);
    
    vec3 toLight = normalize(lightPos1 - p);
    vec3 n = getNormal(p);
    
    float diffC = 0.;

    if (u_diffuseOn)
        diffC = clamp(dot(toLight, n), 0., 1.);
    else
        diffC = 1.;
    
    
    // calculate shadow
    if (u_shadowOn)
    {
        float sdfToLight = rayMarch(p + n * 1.8 * HIT_RANGE, toLight).w;
        if (sdfToLight < length(lightPos1 - p))
            diffC *= .2;
    }


    return vec3(color * diffC);
}

void main() {
    vec3 color = vec3(0.);

    //gl_FragColor = vec4(v_uv, 0.0, 1.0);
    vec2 uv = vec2(gl_FragCoord.x / u_clientResolution.x, gl_FragCoord.y / u_clientResolution.y);
    
    uv.xy -= vec2(0.5, 0.5);                                    // transform uv to middle of screen (cam middle)
    uv.x *= (u_clientResolution.x/u_clientResolution.y);        // fix aspect ratio (default UV viewport is 1:1)
    
    // initialize ray with perspective
    vec3 ro = vec3(u_pos.x, u_pos.y, u_pos.z);
    vec3 rd = normalize(vec3(uv, 1.));
    
    // rotate our view direction
    rd = normalize((u_camRotMat * vec4(rd, 0.)).xyz);

    vec4 rayRes = rayMarch(ro, rd);
    float d = rayRes.w;

    vec3 c = vec3(0.);

    if (u_normalsOnly)
        c = getNormal(ro + rd * d);
    else
        c = getLight(ro + rd * d, rayRes.xyz);

    color = vec3(c);
    gl_FragColor = vec4(color, 1.);
}