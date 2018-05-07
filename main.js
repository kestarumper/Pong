"use strict";
var canvas = document.getElementById("cnv");
var gl = canvas.getContext("webgl2");
if (!gl) {
    throw "Kappa";
}

const POINT_SIZE = canvas.clientHeight * 0.025;
const LINE_WIDTH = canvas.clientWidth * 0.0025;
const PIXELS_PER_SEC = canvas.clientWidth * 0.333;
const ACCELERATION = 1.01;

var vertexShaderSource = `#version 300 es

// an attribute is an input (in) to a vertex shader.
// It will receive data from a buffer
in vec2 a_position;

// Used to pass in the resolution of the canvas
uniform vec2 u_resolution;

// translation to add to position
uniform vec2 u_translation;

// all shaders have a main function
void main() {
  // Add in the translation
  vec2 position = a_position + u_translation;

  // convert the position from pixels to 0.0 to 1.0
  vec2 zeroToOne = position / u_resolution;

  // convert from 0->1 to 0->2
  vec2 zeroToTwo = zeroToOne * 2.0;

  // convert from 0->2 to -1->+1 (clipspace)
  vec2 clipSpace = zeroToTwo - 1.0;
  
  gl_Position = vec4(clipSpace, 0, 1);
  gl_PointSize = ${POINT_SIZE.toFixed(1)};
}
`;

var fragmentShaderSource = `#version 300 es

precision mediump float;

uniform vec4 u_color;

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {
    outColor = u_color;
}
`;

function resizeCanvasToDisplaySize(canvas, multiplier) {
    multiplier = multiplier || 1;
    var width = canvas.clientWidth * multiplier | 0;
    var height = canvas.clientHeight * multiplier | 0;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }
    return false;
}

function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }

    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

function createProgramFromSources(gl, vertexSources, fragmentSources) {
    var program = gl.createProgram();
    var shader = null;

    for (var src of vertexSources) {
        shader = createShader(gl, gl.VERTEX_SHADER, src);
        gl.attachShader(program, shader);
    }

    for (var src of fragmentSources) {
        shader = createShader(gl, gl.FRAGMENT_SHADER, src);
        gl.attachShader(program, shader);
    }

    gl.linkProgram(program);

    var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
        var lastError = gl.getProgramInfoLog(program);
        console.error("Error in program linking:" + lastError);
        gl.deleteProgram(program);
        return null;
    }

    return program;
}

//=========================================================================

var drawables = [];

const plankWidth = canvas.clientWidth * 0.025;
const plankHeight = canvas.clientHeight * 0.25;

const DATA = {
    plank: {
        geometry: [
            0, 0,
            plankWidth, 0,
            0, plankHeight,
            0, plankHeight,
            plankWidth, 0,
            plankWidth, plankHeight,
        ],
        type: gl.TRIANGLES,
        vertices: 6,
    },

    ball: {
        geometry: [0, 0],
        type: gl.POINTS,
        vertices: 1,
    },

    fieldLine: {
        geometry: [
            0, 0,
            0, canvas.clientHeight,
        ],
        type: gl.LINES,
        vertices: 2,
    },

    fieldCenter: {
        geometry: [
            -canvas.clientWidth * 0.25, -canvas.clientHeight * 0.25,
            canvas.clientWidth * 0.25, -canvas.clientHeight * 0.25,
            canvas.clientWidth * 0.25, canvas.clientHeight * 0.25, 
            -canvas.clientWidth * 0.25, canvas.clientHeight * 0.25,
        ],
        type: gl.LINE_LOOP,
        vertices: 4,
    },

    fieldCenterRhombus: {
        geometry: [
            0, -canvas.clientHeight * 0.05,
            canvas.clientWidth * 0.05, 0,
            0, canvas.clientHeight * 0.05,
            -canvas.clientWidth * 0.05, 0,
        ],
        type: gl.TRIANGLE_FAN,
        vertices: 4,
    }
};

// Use our boilerplate utils to compile the shaders and link into a program
var program = createProgramFromSources(gl, [vertexShaderSource], [fragmentShaderSource]);

// look up where the vertex data needs to go.
var positionAttributeLocation = gl.getAttribLocation(program, "a_position");

// look up uniform locations
var resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
var colorLocation = gl.getUniformLocation(program, "u_color");
var translationLocation = gl.getUniformLocation(program, "u_translation");

class Drawable {
    constructor(geometry, verticesNumber, type, translation, color) {
        /* Drawing data */
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry), gl.STATIC_DRAW);
        this.type = type;
        this.count = verticesNumber;
        this.moveVector = [0, 0];

        this.translation = translation || [0, 0];
        this.color = color || this.randomColor();
    }

    getCollisionRange() {
        var xmin = this.translation[0];
        var xmax = this.translation[0] + plankWidth;
        var ymin = this.translation[1];
        var ymax = this.translation[1] + plankHeight;
        return {
            x: { min: xmin, max: xmax },
            y: { min: ymin, max: ymax },
        };
    }

    moveUpdate(deltaTime) {

    }

    randomColor() {
        return [Math.random(), Math.random(), Math.random(), 1];
    }

    randomMoveVector() {
        return [(Math.random() > 0.5 ? 1 : -1), ((Math.random() * 2) - 1) * 0.5];
    }

    draw() {
        // Turn on the attribute
        gl.enableVertexAttribArray(positionAttributeLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

        gl.lineWidth(LINE_WIDTH);

        // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
        var size = 2;          // 2 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            positionAttributeLocation, size, type, normalize, stride, offset);

        // Set the color.
        gl.uniform4fv(colorLocation, this.color);

        // Set the translation.
        gl.uniform2fv(translationLocation, this.translation);

        // Draw the geometry.
        var primitiveType = this.type;
        var offset = 0;
        var count = this.count;
        gl.drawArrays(primitiveType, offset, count);
    }
}

class Plank extends Drawable {
    constructor(geometry, verticesNumber, type, keys, translation, color) {
        super(geometry, verticesNumber, type, translation, color);

        this.moveVector = [0, 1];
        this.keys = keys || { up: 'w', down: 's' };

        this.keysPressed = {};

        window.addEventListener('keydown', (event) => {
            this.keysPressed[event.key] = true;
        });
        window.addEventListener('keyup', (event) => {
            this.keysPressed[event.key] = false;
        });
    }

    moveUpdate(deltaTime) {
        if(this.keysPressed[this.keys.up] === true) {
            this.translation[1] += PIXELS_PER_SEC * deltaTime;
        }
        if(this.keysPressed[this.keys.down] === true) {
            this.translation[1] -= PIXELS_PER_SEC * deltaTime;
        }
    }
}

class Ball extends Drawable {
    constructor(geometry, verticesNumber, type, translation, moveVector, color) {
        super(geometry, verticesNumber, type, translation);
        this.moveVector = moveVector || this.randomMoveVector();
        this.collidables = [];
        this.isInsideCollidable = false;
    }

    moveUpdate(deltaTime) {
        this.bounce(this.detectCollision());
        this.translation[0] += PIXELS_PER_SEC * this.moveVector[0] * deltaTime;
        this.translation[1] += PIXELS_PER_SEC * this.moveVector[1] * deltaTime;
    }

    registerCollisionObject(obj) {
        if (!(obj instanceof Drawable)) {
            throw new Error('Object must be of type Drawable');
        }
        this.collidables.push(obj);
    }

    bounce(modifiers) {
        if(modifiers != null) {
            this.isInsideCollidable = true;
            this.moveVector[0] = this.moveVector[0] * modifiers[0] * ACCELERATION;
            this.moveVector[1] = this.moveVector[1] * modifiers[1] * ACCELERATION;
        } else {
            this.isInsideCollidable = false;
        }
    }

    detectCollision() {
        var range;
        var x = this.translation[0];
        var y = this.translation[1];
        var ballOffset = (POINT_SIZE / 2);
        for (var obj of this.collidables) {
            range = obj.getCollisionRange();
            if (!this.isInsideCollidable &&
                range.x.min - ballOffset <= x && x <= range.x.max + ballOffset &&
                range.y.min - ballOffset <= y && y <= range.y.max + ballOffset
            ) {
                return [-1, 1];
            }
        }

        if (y <= 0 || canvas.clientHeight <= y) {
            return [1, -1];
        }

        if (x <= 0 || canvas.clientWidth <= x) {
            this.translation = [canvas.clientWidth / 2, canvas.clientHeight / 2];
            this.moveVector = this.randomMoveVector();
            this.color = this.randomColor();
        }

        return null;
    }
}

drawables.push(new Plank(DATA.plank.geometry, 6, DATA.plank.type));
drawables.push(
    new Plank(
        DATA.plank.geometry,
        DATA.plank.vertices,
        DATA.plank.type,
        { up: 'o', down: 'l' },
        [canvas.clientWidth - plankWidth, canvas.clientHeight - plankHeight],
    )
);
drawables.push(
    new Drawable(
        DATA.fieldCenter.geometry,
        DATA.fieldCenter.vertices,
        DATA.fieldCenter.type,
        [canvas.clientWidth / 2, canvas.clientHeight / 2],
        [1, 0, 0, 1],
    )
)
drawables.push(
    new Drawable(
        DATA.fieldCenterRhombus.geometry,
        DATA.fieldCenterRhombus.vertices,
        DATA.fieldCenterRhombus.type,
        [canvas.clientWidth / 2, canvas.clientHeight / 2],
        [0, 0, 1, 1],
    )
);
drawables.push(
    new Drawable(
        DATA.fieldLine.geometry,
        DATA.fieldLine.vertices,
        DATA.fieldLine.type,
        [canvas.clientWidth / 2, 0],
        [0, 0, 0, 1],
    )
);

function addNewBall(drawables) {
    var ball = new Ball(
        DATA.ball.geometry,
        DATA.ball.vertices,
        DATA.ball.type,
        [canvas.clientWidth / 2, canvas.clientHeight / 2],
    );
    ball.registerCollisionObject(drawables[0]);
    ball.registerCollisionObject(drawables[1]);
    drawables.push(ball);
}
for (let i = 0; i < 1; i += 1) {
    addNewBall(drawables);
}

// Draw the scene.
var then = 0;
function drawScene(now) {
    now *= 0.001;
    var deltaTime = now - then;
    then = now;

    resizeCanvasToDisplaySize(gl.canvas);

    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Clear the canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Tell it to use our program (pair of shaders)
    gl.useProgram(program);

    // Pass in the canvas resolution so we can convert from
    // pixels to clipspace in the shader
    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

    for (var obj of drawables) {
        obj.moveUpdate(deltaTime);
        obj.draw();
    }

    requestAnimationFrame(drawScene);
}

requestAnimationFrame(drawScene);

window.addEventListener('keypress', (event) => {
    if(event.key === '`') {
        addNewBall(drawables);
    }
});