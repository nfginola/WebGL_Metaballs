/* global WebGLUtils, Matrix4, Vector3 */

var object = {};
var scene;
var offset = 3;

window.onload = function loadGLSLFiles() {
    var scripts = [
        {
            filename: "vertex.glsl",
            type: "x-vertex",
            id: "vertex-shader"
        },
        {
            filename: "fragment.glsl",
            type: "x-fragment",
            id: "fragment-shader"
        },
    ];

    var container = document.getElementById("shader-container");

    Promise.all(
        scripts.map((script) => fetch(script.filename).then(resp => resp.text()))
    )
        .then(function(result) {
            scripts.forEach(function(script, i) {
                var scriptElement = document.createElement("script");

                scriptElement.type = "x-shader/" + script.type;
                scriptElement.id = script.id;
                scriptElement.textContent = result[i];

                container.appendChild(scriptElement);
            });
        })
        .then(runProgram);
};

function runProgram() {
    "use strict";
    var canvas, gl;

    // Get a WebGL context!
    canvas = document.getElementById("canvas1");
    gl = WebGLUtils.getWebGLContext(canvas);
    if (!gl) {
        return;
    }

    // Initialize program and default cube
    let glProgramInfo = initWebGL(gl);
    let quad = initQuad(gl, glProgramInfo);

    // Initialize control panel
    let cp = initControlPanel();

    // Initialize player camera
    let playerCam = initPlayerCamera(100);
    console.log(playerCam);

    // Initialize input handler
    let input = initInputHandler();

    // Initialize scene
    scene = initScene();

    let dt = 0;
    let prevTime = 0;
    let elapsedTimer = 0;
    let frameCount = 0;
    let timeElapsed = 0;


    let v = reflect((new Vector3([0.97, 0, 0.24]).normalize()), new Vector3([-1, 0, 0]));
    console.log(v);

    // Enable backface culling and depth test!
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.DEPTH_TEST);

    // Start update
    cp.animReq = window.requestAnimationFrame(update);
    cp.updateFunc = update;

    function update(currTime) {
        dt = (currTime - prevTime) / 1000.0;
        prevTime = currTime;
        cp.dt = dt;

        if (cp.justUnpaused) {
            cp.dt = cp.lastdt;
            cp.justUnpaused = false;
        }

        // Reset time elapsed if over 30 min
        if (!cp.paused) {
            if (timeElapsed >= 60 * 30) {
                timeElapsed = 0;
                cp.lastdt = dt;
            }
            timeElapsed += cp.dt;
        }


        // if this frame happens to halve the previous dt --> stutter
        // set dt to 60 target to avoid collision bugs
        // cp.dt = 0.01666;

        updateWorld(cp.dt, cp.animSpeed);
        render();

        // Averaged FPS timer (every second)
        elapsedTimer += cp.dt;
        frameCount++;
        if (elapsedTimer > 1) {
            let fps =  frameCount/elapsedTimer;
            document.getElementById("fpscounter").innerHTML = Math.round(fps);
            elapsedTimer = frameCount = 0;
        }

        cp.animReq = requestAnimationFrame(update);
    }


    function updateWorld(dt, animSpeed) {
        // Update player
        playerCam.updatePosition(input, dt);
        playerCam.updateOrientation(input, dt);

        // Update metaball positions
        if (!cp.paused) {
            let objs = scene.objects;
            for (let i = 0; i < objs.length; ++i) {
                let bounced = false;
                let finalNormal = new Vector3([0, 0, 0]);

                // set bounceTimer and account for faster-ocurring bounces
                objs[i].bounceTimer += dt * animSpeed;

                // check world boundaries to reflect velocity prior to updating
                if (objs[i].position[0] > scene.xPosBoundary) {
                    finalNormal.elements[0] = -1;
                    bounced = true;
                } else if (objs[i].position[0] < scene.xNegBoundary) {
                    finalNormal.elements[0] = 1;
                    bounced = true;
                }

                if (objs[i].position[1] > scene.yPosBoundary) {
                    finalNormal.elements[1] = -1;
                    bounced = true;
                } else if (objs[i].position[1] < scene.yNegBoundary) {
                    finalNormal.elements[1] = 1;
                    bounced = true;
                }

                if (objs[i].position[2] > scene.zPosBoundary) {
                    finalNormal.elements[2] = -1;
                    bounced = true;
                } else if (objs[i].position[2] < scene.zNegBoundary) {
                    finalNormal.elements[2] = 1;
                    bounced = true;
                }

                if (bounced && objs[i].bounceTimer > 0.25) {
                    finalNormal = finalNormal.normalize();
                    let refVector = reflect(objs[i].velDir, finalNormal).normalize();
                    objs[i].velDir.elements[0] = refVector.elements[0];
                    objs[i].velDir.elements[1] = refVector.elements[1];
                    objs[i].velDir.elements[2] = refVector.elements[2];
                    bounced = false;
                    objs[i].bounceTimer = 0;
                }

                objs[i].update(dt, animSpeed);

                // update big array for uniform
                scene.balls[i * 4] = objs[i].position[0];
                scene.balls[i * 4 + 1] = objs[i].position[1];
                scene.balls[i * 4 + 2] = objs[i].position[2];
            }
        }
    }

    function updateUniforms() {
        // Player Pos
        gl.uniform3f(glProgramInfo.uPos, playerCam.position.elements[0],
            playerCam.position.elements[1], -playerCam.position.elements[2]);

        // Rotation matrix for camera orientation
        let rotMat = new Matrix4();
        rotMat.rotate(-playerCam.currentYaw, 0, playerCam.worldUp, 0);
        rotMat.rotate(-playerCam.currentPitch, playerCam.worldRight, 0, 0);
        gl.uniformMatrix4fv(glProgramInfo.uCamRotMat, false, rotMat.elements);

        gl.uniform2f(glProgramInfo.uClientResolution, canvas.clientWidth,
            canvas.clientHeight);

        gl.uniform1f(glProgramInfo.uElapsedTime, timeElapsed);

        gl.uniform4fv(glProgramInfo.uBalls, scene.balls);

        gl.uniform3fv(glProgramInfo.uColors, scene.colors);

        gl.uniform1i(glProgramInfo.uActiveBallCount, scene.objects.length);

        gl.uniform1f(glProgramInfo.uBlobFactor, cp.blobFactor);

        gl.uniform1f(glProgramInfo.uShadowOn, cp.shadowOn);

        gl.uniform1f(glProgramInfo.uDiffuseOn, cp.diffuseOn);

        gl.uniform1f(glProgramInfo.uNormalsOnly, cp.normalsOnly);
    }

    function render() {
        // Render
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        updateUniforms();

        // Draw quad
        gl.drawElements(gl.TRIANGLES, quad.indices, gl.UNSIGNED_BYTE, 0);
    }

    console.log("Everything is ready.");
}

function reflect(vec, nor) {
    // r = d - 2(d*n)n

    let res = new Vector3([0, 0, 0]);
    let dot = 2 * vec3_dot(vec.normalize(), nor.normalize());
    let rh = vec3_scalarMul(nor.normalize(), dot);

    res = vec3_subtract(vec.normalize(), rh);
    return res.normalize();
}

function vec3_dot(vec1, vec2) {
    return vec1.elements[0] * vec2.elements[0] +
    vec1.elements[1] * vec2.elements[1] +
    vec1.elements[2] * vec2.elements[2];
}

function vec3_add(vec1, vec2) {
    let newVec = new Vector3([0, 0, 0]);

    newVec.elements[0] = vec1.elements[0] + vec2.elements[0];
    newVec.elements[1] = vec1.elements[1] + vec2.elements[1];
    newVec.elements[2] = vec1.elements[2] + vec2.elements[2];
    return newVec;
}

function vec3_subtract(vec1, vec2) {
    let newVec = new Vector3([0, 0, 0]);

    newVec.elements[0] = vec1.elements[0] - vec2.elements[0];
    newVec.elements[1] = vec1.elements[1] - vec2.elements[1];
    newVec.elements[2] = vec1.elements[2] - vec2.elements[2];
    return newVec;
}

function vec3_scalarMul(vec, scalar) {
    let newVec = new Vector3([0, 0, 0]);

    newVec.elements[0] = vec.elements[0] * scalar;
    newVec.elements[1] = vec.elements[1] * scalar;
    newVec.elements[2] = vec.elements[2] * scalar;
    return newVec;
}

function vec3_negate(vec) {
    let newVec = new Vector3([0, 0, 0]);

    newVec.elements[0] = -vec.elements[0];
    newVec.elements[1] = -vec.elements[1];
    newVec.elements[2] = -vec.elements[2];
    return newVec;
}

function initScene() {
    let scene = {
        objects: new Array(0),
        balls: new Array(0),
        colors: new Array(0),
        xPosBoundary: 9,
        xNegBoundary: -9,
        yPosBoundary: 9,
        yNegBoundary: 1,
        zPosBoundary: 20,
        zNegBoundary: 5,
        hardLimit: 30
    };

    scene.addObject = function(obj) {
        if (this.objects.length >= scene.hardLimit) {
            return;
        }

        this.objects.push(obj);
        this.balls.push(obj.position[0]);
        this.balls.push(obj.position[1]);
        this.balls.push(obj.position[2]);
        this.balls.push(obj.radius);

        this.colors.push(obj.color[0]);
        this.colors.push(obj.color[1]);
        this.colors.push(obj.color[2]);
        document.getElementById("blobcount").innerHTML = this.objects.length;
    };

    scene.genNewObj = function() {
        let obj = Object.create(object);

        obj.position = [0, 0, 0];
        obj.velDir = new Vector3([0, 0, 0]);
        obj.velocity = 0;
        obj.color = [0, 0, 0];
        obj.radius = Math.random() * 1 + 0.75;
        obj.bounceTimer = 0;

        obj.position[0] = Math.random() * ((scene.xPosBoundary - offset) -
        (scene.xNegBoundary + offset)) + scene.xNegBoundary + offset;
        obj.position[1] = Math.random() * ((scene.yPosBoundary - offset) -
        (scene.yNegBoundary + offset)) + scene.yNegBoundary + offset;
        obj.position[2] = Math.random() * ((scene.zPosBoundary - offset) -
        (scene.zNegBoundary + offset)) + scene.zNegBoundary + offset;

        obj.velDir.elements[0] = Math.random() * 50 - 25;
        obj.velDir.elements[1] = Math.random() * 50 - 25;
        obj.velDir.elements[2] = Math.random() * 50 - 25;

        obj.velDir = obj.velDir.normalize();
        obj.velocity = Math.random() * 2 + 1;

        obj.color[0] = Math.random();
        obj.color[1] = Math.random();
        obj.color[2] = Math.random();

        scene.addObject(obj);
    };

    object.update = function(dt, animSpeed) {
        // p = p0 + v*dt
        this.position[0] += this.velDir.elements[0] * this.velocity * dt * animSpeed;
        this.position[1] += this.velDir.elements[1] * this.velocity * dt * animSpeed;
        this.position[2] += this.velDir.elements[2] * this.velocity * dt * animSpeed;
    };

    // Create default scene
    for (let i = 0; i < 5; ++i) {
        scene.genNewObj();
    }

    return scene;
}

function initWebGL(gl) {
    // Load shaders
    var program = WebGLUtils.createProgramFromScripts(gl, ["vertex-shader", "fragment-shader"]);
    gl.useProgram(program);

    // Get handles
    var a_pos = gl.getAttribLocation(program, "a_pos");
    if (a_pos === -1) {
        console.log("a_pos not found");
        return;
    }

    var a_uv = gl.getAttribLocation(program, "a_uv");
    if (a_uv === -1) {
        console.log("a_uv not found");
        return;
    }

    var u_pos = gl.getUniformLocation(program, "u_pos");
    if (u_pos === -1) {
        console.log("u_pos not found");
        return;
    }

    var u_camRotMat = gl.getUniformLocation(program, "u_camRotMat");
    if (u_camRotMat === -1) {
        console.log("u_camRotMat not found");
        return;
    }

    var u_clientResolution = gl.getUniformLocation(program, "u_clientResolution");
    if (u_clientResolution === -1) {
        console.log("u_clientResolution not found");
        return;
    }

    var u_elapsedTime = gl.getUniformLocation(program, "u_elapsedTime");
    if (u_elapsedTime === -1) {
        console.log("u_elapsedTime not found");
        return;
    }

    var u_balls = gl.getUniformLocation(program, "u_balls");
    if (u_balls === -1) {
        console.log("u_balls not found");
        return;
    }

    var u_activeBallCount = gl.getUniformLocation(program, "u_activeBallCount");
    if (u_activeBallCount === -1) {
        console.log("u_activeBallCount not found");
        return;
    }

    var u_blobFactor = gl.getUniformLocation(program, "u_blobFactor");
    if (u_blobFactor === -1) {
        console.log("u_blobFactor not found");
        return;
    }

    var u_colors = gl.getUniformLocation(program, "u_colors");
    if (u_colors === -1) {
        console.log("u_colors not found");
        return;
    }

    var u_shadowOn = gl.getUniformLocation(program, "u_shadowOn");
    if (u_shadowOn === -1) {
        console.log("u_shadowOn not found");
        return;
    }

    var u_diffuseOn = gl.getUniformLocation(program, "u_diffuseOn");
    if (u_diffuseOn === -1) {
        console.log("u_diffuseOn not found");
        return;
    }

    var u_normalsOnly = gl.getUniformLocation(program, "u_normalsOnly");
    if (u_normalsOnly === -1) {
        console.log("u_normalsOnly not found");
        return;
    }

    let glProgramInfo = {
        theProgram: program,
        posHandle: a_pos,
        uvHandle: a_uv,
        uPos: u_pos,
        uCamRotMat: u_camRotMat,
        uClientResolution: u_clientResolution,
        uElapsedTime: u_elapsedTime,
        uBalls: u_balls,
        uActiveBallCount: u_activeBallCount,
        uBlobFactor: u_blobFactor,
        uColors: u_colors,
        uShadowOn: u_shadowOn,
        uDiffuseOn: u_diffuseOn,
        uNormalsOnly: u_normalsOnly
    };

    return glProgramInfo;
}

function initQuad(gl, glProgramInfo) {
    // Define Vertex (Pos and UV) (CCW)
    var vertexData = new Float32Array([
        -1.0, 1.0, 0,       0, 1,
        -1.0, -1.0, 0,      0, 0,
        1.0, -1.0, 0,       1, 0,
        1.0, 1.0, 0,        1, 1,
    ]);

    // Define how to index the vertex data
    var indexData = new Uint8Array([
        // Front quad
        0, 1, 2,
        0, 2, 3,
    ]);

    var vertexBuffer = gl.createBuffer();
    var indexBuffer = gl.createBuffer();

    // Fill the vertex buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

    // Fill index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

    // Set layout and enable attributes (Pos and UV respectively)
    gl.vertexAttribPointer(glProgramInfo.posHandle, 3, gl.FLOAT,
        false, vertexData.BYTES_PER_ELEMENT * 5, 0);
    gl.enableVertexAttribArray(glProgramInfo.posHandle);

    // Notice last argument is the offset to the UV's in the vertexData!
    gl.vertexAttribPointer(glProgramInfo.uvHandle, 2, gl.FLOAT,
        false, vertexData.BYTES_PER_ELEMENT * 5,
        vertexData.BYTES_PER_ELEMENT * 3);
    gl.enableVertexAttribArray(glProgramInfo.uvHandle);

    var quad = {
        vertexBuf: vertexBuffer,
        indexBuf: indexBuffer,
        indices: indexData.length
    };

    return quad;
}

function initPlayerCamera(farPlane) {
    let player = {
        position: new Vector3([0, 4, 3]),
        rightVec: new Vector3([1, 0, 0]),
        upVec: new Vector3([0, 1, 0]),
        forwardVec: new Vector3([0, 0, -1]),
        farPlane: farPlane,
        currentYaw: 0,      // X
        currentPitch: 0,     // Y
        mouseSpeed: 5,
        playerSpeed: 5,
        worldRight: new Vector3([1, 0, 0]),
        worldUp: new Vector3([0, 1, 0]),
        worldForward: new Vector3([0, 0, -1]),
    };

    player.getViewMatrix = function() {
        let viewMat = new Matrix4();
        let lookAtPos = vec3_add(this.position, this.forwardVec);

        viewMat.setLookAt(this.position.elements[0], this.position.elements[1],
            this.position.elements[2], lookAtPos.elements[0],
            lookAtPos.elements[1], lookAtPos.elements[2],
            this.worldUp.elements[0],
            this.worldUp.elements[1], this.worldUp.elements[2]);
        return viewMat;
    };

    player.updatePosition = function(input, dt) {
        let finalDirection = new Vector3();
        // Move right/left
        if (input.keys[65] === true) {
            finalDirection = vec3_add(finalDirection, vec3_negate(this.rightVec));
        } else if (input.keys[68] === true) {
            finalDirection = vec3_add(finalDirection, this.rightVec);
        }

        // Move front/back
        if (input.keys[83] === true) {
            finalDirection = vec3_add(finalDirection, vec3_negate(this.forwardVec));
        } else if (input.keys[87] === true) {
            finalDirection = vec3_add(finalDirection, this.forwardVec);
        }

        // Move up/down
        if (input.keys[81] === true) {
            finalDirection = vec3_add(finalDirection, vec3_negate(this.worldUp));
        } else if (input.keys[69] === true) {
            finalDirection = vec3_add(finalDirection, this.worldUp);
        }

        if (input.keys[16] === true) {
            this.playerSpeed = 15;
        } else {
            this.playerSpeed = 5;
        }

        // Movement direction is final, now we add velocity
        finalDirection = finalDirection.normalize();
        let toMove = vec3_scalarMul(finalDirection, this.playerSpeed * dt);
        this.position.elements[0] += toMove.elements[0];
        this.position.elements[1] += toMove.elements[1];
        this.position.elements[2] += toMove.elements[2];

        // document.getElementById("camposx").innerHTML =
        // Math.round(this.position.elements[0] * 1000) / 1000;
        // document.getElementById("camposy").innerHTML =
        // Math.round(this.position.elements[1] * 1000) / 1000;
        // document.getElementById("camposz").innerHTML =
        // Math.round(this.position.elements[2] * 1000) / 1000;

        // let lookAtPos = vec3_add(this.position, this.forwardVec);
        // document.getElementById("camtargetx").innerHTML =
        // Math.round(lookAtPos.elements[0] * 1000) / 1000;
        // document.getElementById("camtargety").innerHTML =
        // Math.round(lookAtPos.elements[1] * 1000) / 1000;
        // document.getElementById("camtargetz").innerHTML =
        // Math.round(lookAtPos.elements[2] * 1000) / 1000;
    };

    player.updateOrientation = function(input, dt) {
        // Handle camera orientation change when LMB is held down
        if (input.mouse.lmbDown === true) {
            this.currentYaw -= input.mouse.deltaX * this.mouseSpeed * dt;
            this.currentPitch -= input.mouse.deltaY * this.mouseSpeed * dt;

            // Prevent gimbal lock
            if (this.currentPitch > 90) {
                this.currentPitch = 89.9;
            } else if (this.currentPitch < -90) {
                this.currentPitch = -89.9;
            }

            // Rotate forward vec
            let rotMat = new Matrix4();
            rotMat.rotate(this.currentYaw, 0, this.worldUp, 0);
            rotMat.rotate(this.currentPitch, this.worldRight, 0, 0);
            this.forwardVec = rotMat.multiplyVector3(this.worldForward).normalize();

            // Rotate right vec
            let rotMat2 = new Matrix4();
            rotMat2.rotate(this.currentYaw, 0, this.worldUp, 0);
            this.rightVec = rotMat2.multiplyVector3(this.worldRight).normalize();

            // Rotate up vec
            this.upVec = rotMat.multiplyVector3(this.worldUp).normalize();

            // document.getElementById("upvecx").innerHTML =
            // Math.round(this.upVec.elements[0] * 1000) / 1000;
            // document.getElementById("upvecy").innerHTML =
            // Math.round(this.upVec.elements[1] * 1000) / 1000;
            // document.getElementById("upvecz").innerHTML =
            // Math.round(this.upVec.elements[2] * 1000) / 1000;
        } else {
            input.mouse.deltaX = 0;
            input.mouse.deltaY = 0;
        }
    };

    // document.getElementById("upvecx").innerHTML =
    // Math.round(player.upVec.elements[0] * 1000) / 1000;
    // document.getElementById("upvecy").innerHTML =
    // Math.round(player.upVec.elements[1] * 1000) / 1000;
    // document.getElementById("upvecz").innerHTML =
    // Math.round(player.upVec.elements[2] * 1000) / 1000;

    return player;
}

function initInputHandler() {
    var keystate = {};
    var mouseState = {
        deltaX: 0,
        deltaY: 0,
        lmbDown: 0,
    };

    document.addEventListener("keydown", function(event) {
        keystate[event.keyCode] = true;
    }, true);

    document.addEventListener("keyup", function(event) {
        keystate[event.keyCode] = false;
    }, true);

    var mouseTimeout = null;
    document.addEventListener("mousemove", function(event) {
        mouseState.deltaX = event.movementX;
        mouseState.deltaY = event.movementY;

        // If mouse not moving -> Set delta to 0.
        clearTimeout(mouseTimeout);
        mouseTimeout = setTimeout(function() {
            mouseState.deltaX = 0;
            mouseState.deltaY = 0;
        }, 1);
    }, true);

    document.addEventListener("mousedown", function(event) {
        if (event.button === 0) {
            mouseState.lmbDown = true;
        }
    }, true);

    document.addEventListener("mouseup", function(event) {
        if (event.button === 0) {
            mouseState.lmbDown = false;
        }
    }, true);

    var inputContainer = {
        keys: keystate,
        mouse: mouseState
    };
    return inputContainer;
}

function initControlPanel() {
    var speedMultEl = document.getElementById("speedmultiplier");
    speedMultEl.addEventListener("click", function() {
        controlPanel.animSpeed = parseFloat(speedMultEl.value);
    });

    var blobFactorEl = document.getElementById("blobfactor");
    blobFactorEl.addEventListener("click", function() {
        controlPanel.blobFactor = parseFloat(blobFactorEl.value);
    });

    var controlPanel = {
        animReq: null,
        justUnpaused: false,
        lastdt: 0,
        dt: 0,
        animSpeed: parseFloat(speedMultEl.value),
        playerNearPlane: 0,
        playerFarPlane: 0,
        playerFOV: 0,
        blobFactor: parseFloat(blobFactorEl.value),
        shadowOn: true,
        diffuseOn: true,
        normalsOnly: false
    };

    // returns dt to use
    controlPanel.onResume = function() {
        setTimeout(function() {
            controlPanel.paused = false;
            controlPanel.justUnpaused = true;
            controlPanel.dt = controlPanel.lastdt;
        }, 1);
    };

    controlPanel.onPause = function() {
        controlPanel.paused = true;
        controlPanel.animReq = null;
        controlPanel.lastdt = controlPanel.dt;
    };

    controlPanel.onAddBlob = function() {
        scene.genNewObj();
    };

    var shadowEl = document.getElementById("shadowOn");
    var diffuseEl = document.getElementById("diffuse");
    var normalsEl = document.getElementById("normalsonly");

    controlPanel.onShadowChange = function() {
        controlPanel.shadowOn = shadowEl.checked;
    };

    controlPanel.onDiffuseChange = function() {
        controlPanel.diffuseOn = diffuseEl.checked;
    };

    controlPanel.onNormalsOnly = function() {
        controlPanel.normalsOnly = normalsEl.checked;
    };

    document.addEventListener("focus", controlPanel.onResume);
    document.addEventListener("blur", controlPanel.onPause);

    var resumeEl = document.getElementById("resumeanim");
    resumeEl.addEventListener("click", controlPanel.onResume);

    var pauseEl = document.getElementById("pauseanim");
    pauseEl.addEventListener("click", controlPanel.onPause);

    shadowEl.addEventListener("click", controlPanel.onShadowChange);

    diffuseEl.addEventListener("click", controlPanel.onDiffuseChange);

    normalsEl.addEventListener("click", controlPanel.onNormalsOnly);


    var addRandBlobEl = document.getElementById("addrandomblob");
    addRandBlobEl.addEventListener("click", controlPanel.onAddBlob);




    return controlPanel;
}
